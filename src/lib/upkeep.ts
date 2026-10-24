import type { AgentId } from './agents';

// Sessions Bica cleans up and compacts while they sit idle
// (src/server/sessions/upkeep.ts): assistant mode (docs/assistant-mode.md)
// and the hub (docs/hub.md). Their instructions say so, in `long_lived`.
export const keptSmall = (agent: AgentId) =>
  agent === 'assistant' || agent === 'hub';
