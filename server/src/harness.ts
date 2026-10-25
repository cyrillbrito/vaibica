import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';

import { accountsReady, models } from './models/registry';
import { settings } from './settings';
import { timeTools } from './tools/tool-time';
import { dataPath } from './storage';
import { ALL_EXTENSIONS, DEFAULT_EXTENSIONS } from './agents/registry';

export const context = BACKGROUND_CONTEXT;

let harness: Promise<Harness> | undefined;

async function open(): Promise<Harness> {
  await accountsReady.catch(() => {});
  const registry = createRegistry();
  for (const extension of ALL_EXTENSIONS)
    registry.install(timeTools(extension));
  const harness = await Harness.open(
    await openNodeSqliteStorage(dataPath('harness.sqlite')),
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
          return {
            cacheRetention: settings().longCache
              ? ('long' as const)
              : ('short' as const),
          };
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
  return (harness ??= open());
}
