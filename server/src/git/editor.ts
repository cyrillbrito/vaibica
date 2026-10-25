import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

import type { WorkspaceRef } from '@bica/shared/protocol';
import { inside, open } from './workspace';

/**
 * Opens a workspace, or a file in it, in the editor on the dev machine. Bun
 * picks it from VISUAL or EDITOR (or `debug.editor` in bunfig.toml), and only
 * knows GUI editors such as VS Code and Sublime.
 */
export async function openInEditor(ref: WorkspaceRef, path?: string) {
  const { cwd } = await open(ref);
  Bun.openInEditor(path ? inside(cwd, path) : cwd);
}

/**
 * Opens a path from a chat message: a file in the editor, at `:line:column`
 * if given, and a folder (or any path with `reveal`) in Finder. Unlike
 * openInEditor it may point anywhere, since agents write reports outside
 * the workspace.
 */
export async function openPath(path: string, cwd?: string, reveal = false) {
  const [, name = path, line, column] = /^(.*?)(?::(\d+))?(?::(\d+))?$/.exec(
    path,
  )!;
  let file = name;
  if (file === '~' || file.startsWith('~/')) file = homedir() + file.slice(1);
  else if (!isAbsolute(file)) {
    if (!cwd) throw new Error(`No folder to find ${name} in`);
    file = resolve(cwd, file);
  }
  const info = await stat(file).catch(() => undefined);
  if (!info) throw new Error(`Not found: ${name}`);
  if (reveal || info.isDirectory()) {
    const mac = process.platform === 'darwin';
    Bun.spawn(
      mac ? ['open', ...(reveal ? ['-R'] : []), file] : ['xdg-open', file],
    );
    return;
  }
  Bun.openInEditor(file, {
    line: line ? Number(line) : undefined,
    column: column ? Number(column) : undefined,
  });
}
