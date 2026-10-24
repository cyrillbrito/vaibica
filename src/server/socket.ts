import 'server-only';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  diffRevisions,
  type JsonValue,
  type Op,
} from '@earendil-works/chord/delta';
import { WebSocketServer, type WebSocket } from 'ws';

import {
  SOCKET_PATH,
  type Call,
  type Calls,
  type ClientMessage,
  type EntriesHeld,
  type ServerMessage,
  type Topic,
  type Topics,
  type WorkspaceRef,
} from '#lib/protocol';
import {
  archive,
  cleanUpWorktree,
  cleanUpContext,
  compact,
  configure,
  createSession,
  fork,
  markSeen,
  openHub,
  updateHub,
  cancelTonight,
  runTonight,
  saveTonight,
  startNight,
  push as pushSubmission,
  rename,
  setProfile,
  setVoice,
  stop,
  fromUser,
  handBack,
  withdraw,
  conversationDetail,
  watchConversation,
  watchSessions,
} from '#server/sessions';
import { updateSettings, watchModels } from '#server/providers';
import { wsLogger } from '#server/ws-log';
// Starts the loop that keeps assistant and hub sessions small.
import { startUpkeep } from '#server/profiles';
import {
  addAccount,
  answer,
  cancel,
  signIn,
  signOut,
  useFirst,
  watchAccounts,
} from '#server/providers';
import { startCall, stopCall, transcribe } from '#server/voice';
import { watchPlanUsage } from '#server/providers';
import {
  addProject,
  listDirs,
  reorderProjects,
  pinProject,
  watchProjects,
} from '#server/projects';
import { suggestCommitMessage } from '#server/git';
import { openInEditor, openPath } from '#server/git';
import {
  createTerminal,
  removeTerminal,
  resizeTerminal,
  restartTerminal,
  stopTerminal,
  watchTerminal,
  watchTerminals,
  writeTerminal,
} from '#server/terminals';
import {
  commit,
  diff,
  discard,
  pull,
  push,
  readText,
  stage,
  unstage,
  watchFiles,
  watchStatus,
} from '#server/git';

// Boot: this module loads with the first socket, in dev and in production.
startUpkeep();
startNight();

type Sink = {
  snapshot: (value: unknown, kept?: number) => void;
  changes: (ops: readonly Op[]) => void;
};

type Handlers = {
  [K in Call]: (args: Calls[K]['args']) => Promise<Calls[K]['result']>;
};

// The browser is our own typed client, so args arrive as protocol.ts says.
const calls: Handlers = {
  'session.create': async (args) =>
    createSession({
      ...args,
      prompt: args.prompt.trim(),
      // Only the hub's own page makes a hub (openHub).
      profile: args.profile === 'assistant' ? 'assistant' : 'coding',
    }),
  'session.tonight': async ({ id, action, prompt }) => {
    if (action === 'cancel') return cancelTonight(id);
    if (action === 'save') await saveTonight(id, prompt ?? '');
    else await runTonight(id, prompt);
    return '';
  },
  'session.configure': async ({ id, ...choice }) => {
    await configure(id, choice);
    return null;
  },
  'settings.update': async (change) => {
    await updateSettings(change);
    if (change.hubModel !== undefined || change.hubFolder !== undefined)
      await updateHub();
    return null;
  },
  'project.add': async ({ path }) => addProject(path),
  'project.reorder': async ({ ids }) => {
    await reorderProjects(ids);
    return null;
  },
  'project.pin': async ({ id, pinned }) => {
    await pinProject(id, pinned);
    return null;
  },
  'worktree.cleanUp': async (args) =>
    cleanUpWorktree(args.projectId, args.cwd, args.force === true),
  'fs.dirs': async ({ path }) => listDirs(path),
  'session.submit': async (args) => {
    await fromUser(
      args.id,
      args.prompt.trim(),
      args.images ?? [],
      args.requestId,
      args.whenBusy,
      args.keep === true,
    );
    return null;
  },
  'session.handBack': async ({ id }) => {
    await handBack(id);
    return null;
  },
  'session.withdraw': async ({ id, submission }) => withdraw(id, submission),
  'session.push': async ({ id, submission }) => pushSubmission(id, submission),
  'session.stop': async ({ id }) => stop(id),
  'session.archive': async ({ id, archived }) => {
    await archive(id, archived);
    return null;
  },
  'session.rename': async ({ id, title }) => {
    await rename(id, title);
    return null;
  },
  'session.compact': async ({ id, instructions }) => {
    await compact(id, instructions);
    return null;
  },
  'hub.open': async () => openHub(),
  'session.profile': async ({ id, profile }) => {
    if (profile === 'hub') throw new Error('Only the hub is a hub session');
    await setProfile(id, profile);
    return null;
  },
  'session.voice': async ({ id, voice }) => {
    await setVoice(id, voice);
    return null;
  },
  'session.cleanup': async ({ id }) => {
    await cleanUpContext(id);
    return null;
  },
  'session.fork': async ({ id, at }) => fork(id, at),
  'session.detail': async ({ id, key }) => conversationDetail(id, key),
  'session.seen': async ({ id, seen }) => {
    await markSeen(id, seen !== false);
    return null;
  },
  'voice.start': async ({ id, sdp }) => startCall(id, sdp),
  'voice.transcribe': async ({ audio, mimeType }) =>
    transcribe(audio, mimeType),
  'voice.stop': async ({ callId }) => {
    stopCall(callId);
    return null;
  },
  'account.signIn': async ({ id, type }) => {
    await signIn(id, type);
    return null;
  },
  'account.answer': async ({ prompt, value }) => {
    answer(prompt, value);
    return null;
  },
  'account.cancel': async () => {
    await cancel();
    return null;
  },
  'account.add': async ({ provider }) => {
    await addAccount(provider);
    return null;
  },
  'account.useFirst': async ({ id }) => {
    await useFirst(id);
    return null;
  },
  'account.signOut': async ({ id }) => {
    await signOut(id);
    return null;
  },
  'git.stage': async (args) => {
    await stage(ref(args), args.paths, args.repo);
    return null;
  },
  'git.unstage': async (args) => {
    await unstage(ref(args), args.paths, args.repo);
    return null;
  },
  'git.commit': async (args) => {
    await commit(ref(args), args.message.trim(), {
      all: args.all === true,
      amend: args.amend === true,
      repo: args.repo,
    });
    return null;
  },
  'git.discard': async (args) => {
    await discard(ref(args), args.paths, args.repo);
    return null;
  },
  'git.push': async (args) => {
    await push(ref(args), args.repo);
    return null;
  },
  'git.pull': async (args) => {
    await pull(ref(args), args.repo);
    return null;
  },
  'git.suggest': async (args) =>
    suggestCommitMessage(ref(args), {
      all: args.all === true,
      fresh: args.fresh === true,
      repo: args.repo,
    }),
  'git.diff': async (args) =>
    diff(ref(args), args.path, args.staged, args.oldPath, args.repo),
  'file.read': async (args) => readText(ref(args), args.path),
  'editor.open': async (args) => {
    await openInEditor(ref(args), args.path);
    return null;
  },
  'path.open': async ({ path, cwd, reveal }) => {
    await openPath(path, cwd, reveal === true);
    return null;
  },
  'terminal.create': async (args) =>
    createTerminal(ref(args), { command: args.command, title: args.title }),
  'terminal.input': async ({ id, data }) => {
    writeTerminal(id, data);
    return null;
  },
  'terminal.resize': async ({ id, cols, rows }) => {
    resizeTerminal(id, cols, rows);
    return null;
  },
  'terminal.stop': async ({ id }) => {
    await stopTerminal(id);
    return null;
  },
  'terminal.restart': async ({ id }) => {
    await restartTerminal(id);
    return null;
  },
  'terminal.remove': async ({ id }) => {
    await removeTerminal(id);
    return null;
  },
};

// A request re-sent after a reconnect (its reply was lost) gets the first
// run's answer instead of acting twice. Reads simply run again: cheap, and
// their replies can be big. Keystrokes are too many to remember.
const READS = new Set<Call>([
  'fs.dirs',
  'file.read',
  'git.diff',
  'git.suggest',
  'terminal.input',
  'terminal.resize',
]);
const answered = new Map<string, Promise<unknown>>();

function run(id: string, call: Call, args: unknown) {
  const handler = calls[call] as (args: unknown) => Promise<unknown>;
  if (!handler) throw new Error(`Unknown call ${call}`);
  if (READS.has(call)) return handler(args);
  let result = answered.get(id);
  if (!result) {
    result = handler(args);
    answered.set(id, result);
    setTimeout(() => answered.delete(id), 10 * 60_000).unref();
  }
  return result;
}

const topics: {
  [K in Topic]: (
    params: Topics[K]['params'],
    sink: Sink,
    have: EntriesHeld | undefined,
  ) => Promise<() => void>;
} = {
  sessions: (_params, sink) => watchSessions(sink.snapshot),
  projects: (_params, sink) => watchProjects(sink.snapshot),
  models: (_params, sink) => watchModels(sink.snapshot),
  accounts: (_params, sink) => watchAccounts(sink.snapshot),
  'plan.usage': (_params, sink) => watchPlanUsage(sink.snapshot),
  conversation: ({ id }, sink, have) => watchConversation(id, sink, have),
  'git.status': (params, sink) => watchStatus(ref(params), sink.snapshot),
  files: (params, sink) => watchFiles(ref(params), sink.snapshot),
  terminals: (_params, sink) => watchTerminals(sink.snapshot),
  terminal: ({ id }, sink) => watchTerminal(id, sink),
};

// Just the workspace: a call's other args stay out of caches keyed on it.
const ref = ({ projectId, cwd }: WorkspaceRef): WorkspaceRef => ({
  projectId,
  cwd,
});

const wss = new WebSocketServer({ noServer: true });

/** Production: attach to the Node server that serves the app. */
export function attach(server: Server) {
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === SOCKET_PATH) handleUpgrade(req, socket, head);
  });
}

export function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) {
  // There is no login (docs/deploy.md), so at least keep other websites from
  // driving the agent: browsers always send Origin on WebSocket handshakes.
  const origin = req.headers.origin;
  if (origin && hostOf(origin) !== req.headers.host) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, connect);
}

function connect(ws: WebSocket) {
  const subs = new Map<number, () => void>();
  const log = wsLogger();
  const send = (message: ServerMessage) => {
    if (ws.readyState !== ws.OPEN) return;
    const text = JSON.stringify(message);
    log('out', text);
    ws.send(text);
  };

  async function request({
    id,
    call,
    args,
  }: Extract<ClientMessage, { type: 'request' }>) {
    try {
      const value = await run(String(id), call, args ?? {});
      send({ type: 'reply', id, ok: true, value });
    } catch (error) {
      send({ type: 'reply', id, ok: false, error: messageOf(error) });
    }
  }

  async function subscribe({
    sub,
    topic,
    params,
    have,
  }: Extract<ClientMessage, { type: 'subscribe' }>) {
    let live = true;
    let n = 0;
    // Topics that only ever send whole values get each new one as the ops
    // from the last, so a small change stays small. A topic that sends its
    // own ops can't be diffed this way: `sent` would be out of date.
    let sent: { value: unknown } | undefined;
    let diffable = true;
    subs.set(sub, () => (live = false));
    try {
      const open = topics[topic] as (
        params: unknown,
        sink: Sink,
        have: EntriesHeld | undefined,
      ) => Promise<() => void>;
      if (!open) throw new Error(`Unknown topic ${topic}`);
      const stop = await open(
        params ?? {},
        {
          snapshot: (value, kept) => {
            if (!live) return;
            const before = sent;
            sent = { value };
            if (!before || !diffable || kept)
              return send({ type: 'snapshot', sub, n: (n = 0), value, kept });
            const ops = diffRevisions(
              before.value as JsonValue,
              value as JsonValue,
            );
            if (ops.length) send({ type: 'changes', sub, n: ++n, ops });
          },
          changes: (ops) => {
            diffable = false;
            if (live) send({ type: 'changes', sub, n: ++n, ops });
          },
        },
        have,
      );
      // Unsubscribed (or disconnected) while it was opening.
      if (!live) return stop();
      subs.set(sub, () => {
        live = false;
        stop();
      });
    } catch (error) {
      subs.delete(sub);
      if (live) send({ type: 'error', sub, error: messageOf(error) });
    }
  }

  ws.on('message', (data) => {
    let message: ClientMessage;
    try {
      // binaryType is the default 'nodebuffer', so always one Buffer.
      const text = (data as Buffer).toString('utf8');
      message = JSON.parse(text);
      log('in', text);
    } catch {
      ws.close(1003, 'Bad message');
      return;
    }
    if (message.type === 'request') void request(message);
    else if (message.type === 'subscribe') void subscribe(message);
    else if (message.type === 'unsubscribe') {
      subs.get(message.sub)?.();
      subs.delete(message.sub);
    }
  });

  ws.on('close', () => {
    for (const stop of subs.values()) stop();
    subs.clear();
  });
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
