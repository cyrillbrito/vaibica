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

export default definePlugin({
  meta: { name: 'bica' },
  rules: { 'type-tokens': typeTokens, 'radius-tokens': radiusTokens },
});
