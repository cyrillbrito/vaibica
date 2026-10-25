// The agents a session can run as (docs/agents.md): what goes into it. This
// is the half the browser needs; the rest of each one, its model, tools, and
// instructions, is a file in server/src/agents/.
export const AGENTS = {
  coding: {
    label: 'Coding',
    description: 'Works on code with every tool',
  },
  assistant: {
    label: 'Assistant',
    description: 'Keeps going for months in one project, with memory in files',
  },
  night: {
    label: 'Night',
    description:
      'Runs alone at night, without questions, and ends with a report',
  },
  hub: {
    label: 'Hub',
    description: 'Coordinates other sessions and does no work itself',
  },
} as const;

export type AgentId = keyof typeof AGENTS;

export const isAgent = (value: unknown): value is AgentId =>
  typeof value === 'string' && Object.hasOwn(AGENTS, value);
