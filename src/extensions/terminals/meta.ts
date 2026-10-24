import type { Manifest } from '../contract';

export const terminals = {
  id: 'terminals',
  title: 'Terminals',
  about:
    'Shells in a workspace that you and the agents share, in the right panel. A new worktree runs its setup in one.',
  on: true,
  tools: {
    terminal_start: {},
    terminal_read: {},
    terminal_send: {},
    terminal_stop: {},
  },
} as const satisfies Manifest;
