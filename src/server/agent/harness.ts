import 'server-only';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import type { Extension } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';

import { AskTool } from './tools/ask';
import { createCodemode } from './tools/codemode';
import { CodingTools, HubFileTools } from './tools/coding';
import { cacheRetention, exaKey, models, proxyReady } from '#server/providers';
import { HubSessionTools, SessionTools } from '#server/sessions/tools';
import { TerminalTools } from '#server/terminals';
import { timeTools } from './tools/tool-time';
import { createWebTools } from './tools/web';
import { dataFile } from '#server/paths';

export const context = BACKGROUND_CONTEXT;

export const HUB_EXTENSIONS: Extension[] = [
  timeTools(HubFileTools),
  timeTools(HubSessionTools),
  AskTool,
];

// Web tools read the Exa key per call, so adding one needs no restart.
const tools: Extension[] = [CodingTools, TerminalTools, createWebTools(exaKey)];
// Scripts may call the tools above, not the orchestrating or interactive
// ones (session tools, list, ask): Pi's `model-only` tools.
const defaults: Extension[] = [
  ...tools.map(timeTools),
  timeTools(SessionTools),
  AskTool,
  timeTools(createCodemode(tools, models)),
];

// One process owns the storage. Editing vite.config.ts restarts Vite in this
// process and runs the server code again, so the open harness lives on
// globalThis.
const global = globalThis as { harness?: Promise<Harness> };

async function open(): Promise<Harness> {
  await proxyReady.catch(() => {});
  const registry = createRegistry();
  // Profiles that pick their own tools select the hub's (src/server/profiles).
  for (const extension of [...defaults, ...HUB_EXTENSIONS])
    registry.install(extension);
  const harness = await Harness.open(
    await openNodeSqliteStorage(dataFile('harness.sqlite')),
    {
      models,
      registry,
      env: ({ cwd }) => new NodeExecutionEnv({ cwd: cwd ?? process.cwd() }),
      onReport: (error) => console.error('[harness]', error),
      // Steers are corrections: every one waiting lands at the next step.
      // Follow-ups stay one per run.
      settings: {
        // Without it, every session would get the hub's tools too.
        extensions: defaults,
        steeringMode: 'all',
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
