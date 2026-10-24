// Core never names an extension: deleting an extension's folder and its
// line in the lists should leave nothing behind (docs/extensions.md). Finds
// each extension's id and tool names, quoted, in src/ outside src/extensions.
//
//   bun scripts/test-extensions.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MANIFESTS } from '../src/extensions/manifests';

// Test data draws every kind of row, extensions' rows included.
const SKIP = ['src/extensions', 'src/lib/fixtures'];

const files = (dir: string): string[] =>
  SKIP.includes(dir)
    ? []
    : readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? files(join(dir, e.name))
          : /\.tsx?$/.test(e.name)
            ? [join(dir, e.name)]
            : [],
      );

const leaks: string[] = [];
for (const m of MANIFESTS) {
  const names = [m.id, ...Object.keys(m.tools ?? {})];
  const quoted = new RegExp(`['"\`](${[...new Set(names)].join('|')})['"\`]`);
  for (const file of files('src'))
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (quoted.test(line))
          leaks.push(`${file}:${i + 1}: ${m.id}: ${line.trim()}`);
      });
}

if (leaks.length) {
  console.error(`Core names an extension:\n${leaks.join('\n')}`);
  process.exit(1);
}
console.log(`Extensions: core names none of ${MANIFESTS.length}`);
