import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';

import { definePlugin, defineRule } from '@oxlint/plugins';

// The type scale lives in src/App.css (@theme). Tailwind's own sizes and
// families are removed there, so they would silently do nothing; raw sizes
// would bypass the scale. Both fail here. See docs/UI.md, Tokens.
const REMOVED =
  /(?:^|[\s:'"`])(text-(?:xs|sm|base|lg|[2-9]?xl)|font-(?:sans|serif))(?=$|[\s'"`])/;
const RAW = /(?:^|[\s:'"`])((?:text|font)-\[[^\]]*\])/;

function check(context, node, value) {
  if (typeof value !== 'string') return;
  const removed = REMOVED.exec(value);
  if (removed) {
    context.report({
      node,
      messageId: 'removed',
      data: { cls: removed[1] },
    });
  }
  const raw = RAW.exec(value);
  // Colors like text-[var(--x)] are fine; em keeps markdown headings relative.
  if (raw && /\d(px|rem)?\]$|font-\[/.test(raw[1])) {
    context.report({ node, messageId: 'raw', data: { cls: raw[1] } });
  }
}

const typeTokens = defineRule({
  meta: {
    messages: {
      removed:
        '`{{cls}}` is not part of the type scale. Use text-meta, text-ui, text-code, text-read, text-display or font-ui, font-reading, font-mono.',
      raw: '`{{cls}}` bypasses the type scale. Use a role token from App.css @theme.',
    },
  },
  create(context) {
    return {
      Literal: (node) => check(context, node, node.value),
      TemplateElement: (node) => check(context, node, node.value.cooked),
    };
  },
});

// Radii are trimmed the same way (src/App.css @theme): Tailwind's other sizes
// do nothing, and raw ones break the set.
const RADIUS =
  /(?:^|[\s:'"`])(rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?(?:-([\w[\].%-]+))?)(?=$|[\s'"`])/g;
const RADII = new Set([
  'sm',
  'md',
  'lg',
  'card',
  'sheet',
  'tray',
  'cell',
  'full',
  'none',
]);

function checkRadius(context, node, value) {
  if (typeof value !== 'string') return;
  for (const m of value.matchAll(RADIUS)) {
    if (!RADII.has(m[2])) {
      context.report({ node, messageId: 'radius', data: { cls: m[1] } });
    }
  }
}

const radiusTokens = defineRule({
  meta: {
    messages: {
      radius:
        '`{{cls}}` is not part of the radius set. Use rounded-sm, -md, -lg (controls), -card, -sheet, -tray (surfaces), -cell (meter cells), -full or -none.',
    },
  },
  create(context) {
    return {
      Literal: (node) => checkRadius(context, node, node.value),
      TemplateElement: (node) => checkRadius(context, node, node.value.cooked),
    };
  },
});

// Server code and browser code share feature folders
// (docs/explorations/source-layout.md). Solid's Vite plugin fails when the
// browser imports a file marked `import 'server-only'`, but only once a page
// reaches it; this catches it at lint time. Whatever imports server code is
// server code too, so the marker climbs the import chain until it would land
// on a component, which may never carry it.
const MARKER = /^import ['"]server-only['"];?$/m;
const BUILTINS = new Set(builtinModules);
const SERVER_PACKAGES = [
  'bun',
  'ws',
  '@earendil-works/pi-durable',
  '@earendil-works/pi-ai',
  '@earendil-works/pi-codemode',
];

const marked = new Map();
function isMarked(file) {
  if (!marked.has(file))
    marked.set(file, MARKER.test(readFileSync(file, 'utf8')));
  return marked.get(file);
}

const aliases = new Map();
function aliasesFor(file) {
  let dir = dirname(file);
  while (!existsSync(join(dir, 'package.json'))) {
    if (dirname(dir) === dir) return { root: dir, map: {} };
    dir = dirname(dir);
  }
  if (!aliases.has(dir)) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    aliases.set(dir, { root: dir, map: pkg.imports ?? {} });
  }
  return aliases.get(dir);
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx'];
function resolveLocal(from, spec) {
  let base;
  if (spec.startsWith('.')) base = join(dirname(from), spec);
  else if (spec.startsWith('#')) {
    const { root, map } = aliasesFor(from);
    for (const [key, target] of Object.entries(map)) {
      const prefix = key.replace(/\*$/, '');
      if (key.endsWith('*') ? spec.startsWith(prefix) : spec === key) {
        base = join(
          root,
          target.replace(/\*$/, '') + spec.slice(prefix.length),
        );
        break;
      }
    }
  }
  if (!base) return null;
  for (const ext of EXTENSIONS) {
    const file = base + ext;
    if (existsSync(file) && !file.endsWith('/') && /\.[jt]sx?$/.test(file)) {
      return file;
    }
  }
  return null;
}

function isServerSpec(from, spec) {
  const bare = spec.replace(/^node:/, '').split('/')[0];
  if (
    spec.startsWith('node:') ||
    BUILTINS.has(bare) ||
    spec.startsWith('bun:')
  ) {
    return true;
  }
  if (SERVER_PACKAGES.some((p) => spec === p || spec.startsWith(p + '/'))) {
    return true;
  }
  const file = resolveLocal(from, spec);
  return file !== null && isMarked(file);
}

// Type-only imports vanish from the bundle, so they cross freely.
function isTypeOnly(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') return true;
  const specs = node.specifiers ?? [];
  return (
    specs.length > 0 &&
    specs.every((s) => s.importKind === 'type' || s.exportKind === 'type')
  );
}

const serverOnly = defineRule({
  meta: {
    messages: {
      needs:
        "`{{spec}}` is server code, so this file is too: start it with `import 'server-only'`, or import only its types.",
      component:
        "Components run in the browser and can't be server-only. Move the server code behind the socket, or import only its types.",
    },
  },
  create(context) {
    const file = context.filename;
    // Tests and the test server run under Bun only.
    if (
      /\.test\.[jt]sx?$/.test(file) ||
      /[/\\]src[/\\]testing[/\\]/.test(file)
    ) {
      return {};
    }
    const tsx = file.endsWith('.tsx');
    let hasMarker = false;
    const found = [];
    const visit = (node) => {
      const spec = node.source?.value;
      if (typeof spec !== 'string') return;
      if (spec === 'server-only') {
        hasMarker = true;
        if (tsx) context.report({ node, messageId: 'component' });
        return;
      }
      if (!isTypeOnly(node) && isServerSpec(file, spec))
        found.push({ node, spec });
    };
    return {
      ImportDeclaration: visit,
      ExportNamedDeclaration: visit,
      ExportAllDeclaration: visit,
      ImportExpression: visit,
      'Program:exit'() {
        if (hasMarker) return;
        for (const { node, spec } of found) {
          context.report({
            node,
            messageId: tsx ? 'component' : 'needs',
            data: { spec },
          });
        }
      },
    };
  },
});

export default definePlugin({
  meta: { name: 'bica' },
  rules: {
    'type-tokens': typeTokens,
    'radius-tokens': radiusTokens,
    'server-only': serverOnly,
  },
});
