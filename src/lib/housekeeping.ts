import type { AgentId } from './agents';

// Long-lived sessions, which housekeeping prunes and compacts while they sit
// idle (src/server/sessions/housekeeping.ts): assistant mode
// (docs/assistant-mode.md) and the hub (docs/hub.md). Their instructions say
// so, in `long_lived`.
export const isLongLived = (agent: AgentId) =>
  agent === 'assistant' || agent === 'hub';
