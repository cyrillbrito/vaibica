import 'server-only';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Tau's own state, relative to the repo root the server runs from, or `TAU_DATA_DIR` (the `tau` binary sets it). */
export const DATA_DIR = process.env.TAU_DATA_DIR || '.data';

/** The user's Tau folder, like Pi's `~/.pi/agent`: their own `AGENTS.md` and skills. */
export const TAU_HOME = join(homedir(), '.tau');

/** A path under `.data`, creating `.data` on first use. */
export function dataFile(...parts: string[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  return join(DATA_DIR, ...parts);
}
