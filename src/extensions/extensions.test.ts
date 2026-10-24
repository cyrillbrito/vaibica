import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { MANIFESTS } from './manifests';

const SRC = join(import.meta.dir, '..');
// Test data draws every kind of row, extensions' rows included.
const SKIP = ['extensions', 'lib/fixtures'].map((dir) => join(SRC, dir));

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

// Deleting an extension's folder and its line in the lists should leave
// nothing behind (docs/extensions.md): core quotes no extension's id or tool.
test('core names no extension', () => {
  const leaks: string[] = [];
  for (const m of MANIFESTS) {
    const names = [...new Set([m.id, ...Object.keys(m.tools ?? {})])];
    const quoted = new RegExp(`['"\`](${names.join('|')})['"\`]`);
    for (const file of files(SRC))
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (quoted.test(line))
            leaks.push(`${relative(SRC, file)}:${i + 1}: ${line.trim()}`);
        });
  }
  expect(leaks).toEqual([]);
});
