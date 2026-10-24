import 'server-only';
import { setupCommand } from '#server/projects';
import {
  defineServerExtension,
  type CallHandlers,
  type TopicHandlers,
} from '../contract';
import { terminals as manifest } from './meta';
import type { TerminalCalls, TerminalInfo, TerminalTopics } from './protocol';
import {
  allTerminals,
  commandDone,
  createTerminal,
  removeTerminal,
  resizeTerminal,
  restartTerminal,
  stopTerminal,
  terminalsIn,
  watchTerminal,
  watchTerminals,
  writeTerminal,
} from './terminals';
import { HubTerminalTools, TerminalTools, terminalState } from './tools';

const calls: CallHandlers<TerminalCalls> = {
  create: async ({ projectId, cwd, command, title }) =>
    createTerminal({ projectId, cwd }, { command, title }),
  input: async ({ id, data }) => {
    writeTerminal(id, data);
    return null;
  },
  resize: async ({ id, cols, rows }) => {
    resizeTerminal(id, cols, rows);
    return null;
  },
  stop: async ({ id }) => {
    await stopTerminal(id);
    return null;
  },
  restart: async ({ id }) => {
    await restartTerminal(id);
    return null;
  },
  remove: async ({ id }) => {
    await removeTerminal(id);
    return null;
  },
};

const topics: TopicHandlers<TerminalTopics> = {
  list: (_params, sink) => watchTerminals(sink.snapshot),
  output: ({ id }, sink) => watchTerminal(id, sink),
};

async function closeWhere(match: (t: TerminalInfo) => boolean) {
  for (const t of allTerminals()) if (match(t)) await removeTerminal(t.id);
}

export default defineServerExtension({
  manifest,
  durable: [TerminalTools, HubTerminalTools],
  appliesTo: (agent) =>
    agent === 'hub' ? [HubTerminalTools] : [TerminalTools],
  guide: [
    {
      tools: [
        'terminal_start',
        'terminal_read',
        'terminal_send',
        'terminal_stop',
      ],
      line: 'Shells the user sees in Bica, for anything that keeps running',
      // A group's rules need all of its tools: the hub only reads.
      rules: [
        'Anything that keeps running (dev server, watcher, game server) goes in a terminal: terminal_start, never `&` or nohup in bash. Check `list` first: the user may already run it, and your own terminals can be reused with terminal_send. Stop the ones you started once you are done with them, unless the user wants them kept.',
      ],
    },
  ],
  hooks: {
    async worktreeCreated(workspace) {
      const command = await setupCommand(workspace.projectId, workspace.cwd);
      if (!command) return;
      const id = await createTerminal(workspace, { command, title: 'Setup' });
      // Like Zed's `hide: on_success`: only a failed setup stays to be read.
      void commandDone(id).then((code) => {
        if (code === 0) void removeTerminal(id);
      });
    },
    beforeWorktreeRemove: ({ cwd }) => closeWhere((t) => t.cwd === cwd),
    // Its dev servers and shells go with it.
    sessionArchived: (id) => closeWhere((t) => t.startedBy === id),
  },
  inWorkspace: (cwd, session) =>
    terminalsIn(cwd).map(
      (t) =>
        `terminal ${t.id} "${t.title}": ${terminalState(t)}${t.startedBy === session ? ', started by you' : ''}`,
    ),
  calls,
  // Keystrokes are too many to remember.
  reads: ['input', 'resize'],
  topics,
});
