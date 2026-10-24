import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { Manifest } from './contract';
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
// nothing behind (docs/extensions.md): core neither quotes an extension's
// id, tools, or settings, nor uses them as keys.
test('core names no extension', () => {
  const leaks: string[] = [];
  for (const m of MANIFESTS as readonly Manifest[]) {
    const names = [
      ...new Set([
        m.id,
        ...Object.keys(m.tools ?? {}),
        ...Object.keys(m.settings ?? {}),
      ]),
    ].join('|');
    const quoted = new RegExp(
      `['"\`](${names})['"\`]|(^|[{,\\s])(${names})\\??:`,
    );
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
