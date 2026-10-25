import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';

import { accountsReady, cacheRetention, models } from '#server/providers';
import { timeTools } from './tools/tool-time';
import { dataFile } from '#server/paths';
import { ALL_EXTENSIONS, DEFAULT_EXTENSIONS } from '#server/agents/registry';

export const context = BACKGROUND_CONTEXT;

// One process owns the storage. Editing vite.config.ts restarts Vite in this
// process and runs the server code again, so the open harness lives on
// globalThis.
const global = globalThis as { harness?: Promise<Harness> };

async function open(): Promise<Harness> {
  await accountsReady.catch(() => {});
  const registry = createRegistry();
  for (const extension of ALL_EXTENSIONS)
    registry.install(timeTools(extension));
  const harness = await Harness.open(
    await openNodeSqliteStorage(dataFile('harness.sqlite')),
    {
      models,
      registry,
      env: ({ cwd }) => new NodeExecutionEnv({ cwd: cwd ?? process.cwd() }),
      onReport: (error, info) => console.error('[harness]', info.type, error),
      // Steers are corrections: every one waiting lands at the next step.
      // Follow-ups stay one per run.
      settings: {
        // Without it, every session would get the hub's tools too.
        extensions: DEFAULT_EXTENSIONS,
        steeringMode: 'all',
        // Prompts and notes queued behind a failed run still run: many
        // sessions work unwatched, and a note left waiting is never read.
        afterFailedRun: 'continue',
        get stream() {
          return { cacheRetention: cacheRetention() };
        },
      },
    },
    context,
  );
  // Continue runs a previous process left unfinished.
  harness.resume();
  return harness;
}

export function getHarness() {
  return (global.harness ??= open());
}
