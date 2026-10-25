import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Bica's own state: the repo's `.data`, or `BICA_DATA_DIR` (the `bica` binary sets it). */
export const DATA_DIR =
  process.env.BICA_DATA_DIR || join(import.meta.dir, '../../.data');

/** The user's Bica folder, like Pi's `~/.pi/agent`: their own `AGENTS.md` and skills. */
export const BICA_HOME = join(homedir(), '.bica');

/** A path under `.data`, creating `.data` on first use. */
export function dataFile(...parts: string[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  return join(DATA_DIR, ...parts);
}
