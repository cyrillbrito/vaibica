// The agents (docs/agents.md): what goes into a session, its instructions,
// model, tools, and skills. The client's half is shared/src/agents.ts.
export { getAgent, selection } from './registry';
export { agentChoice, atLeast } from './choice';
export { loadMemory, projectList, type Agent } from './common';
