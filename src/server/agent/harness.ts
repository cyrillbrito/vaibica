import 'server-only';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import type { Extension } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';

import { AskTool } from './tools/ask';
import { Codemode } from './tools/codemode';
import { CodingTools, HubFileTools } from './tools/coding';
import { cacheRetention, exaKey, models, proxyReady } from '#server/providers';
import { HubSessionTools, SessionTools } from '#server/sessions/tools';
import { TerminalTools } from '#server/terminals';
import { ToolSummary } from './tools/summary';
import { timeTools } from './tools/tool-time';
import { createWebTools } from './tools/web';
import { dataFile } from '#server/paths';
import { BicaPrompt, BicaReplies } from '#server/profiles/instructions';

export const context = BACKGROUND_CONTEXT;

export const HUB_EXTENSIONS: Extension[] = [
  BicaPrompt,
  HubFileTools,
  HubSessionTools,
  AskTool,
  BicaReplies,
  ToolSummary,
];

// Web tools read the Exa key per call, so adding one needs no restart.
const defaults: Extension[] = [
  BicaPrompt,
  CodingTools,
  TerminalTools,
  createWebTools(exaKey),
  SessionTools,
  AskTool,
  Codemode,
  BicaReplies,
  ToolSummary,
];

// One process owns the storage. Editing vite.config.ts restarts Vite in this
// process and runs the server code again, so the open harness lives on
// globalThis.
const global = globalThis as { harness?: Promise<Harness> };

async function open(): Promise<Harness> {
  await proxyReady.catch(() => {});
  const registry = createRegistry();
  // Profiles that pick their own tools select the hub's (src/server/profiles).
  for (const extension of new Set([...defaults, ...HUB_EXTENSIONS]))
    registry.install(timeTools(extension));
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
