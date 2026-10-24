// A real Bica server for tests, driven over its socket the way the browser
// drives it. Only the model is fake. Tests that use it see Bica from the
// outside, so they keep passing while the code behind the socket changes.
//
// The server is one per process (its data folder and harness are globals),
// so call `startBica` once per test file: `bun test --parallel` runs each
// file in its own process.
import { createServer } from 'node:http';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyImmutable } from '@earendil-works/chord/delta';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseStep,
} from '@earendil-works/pi-ai/providers/faux';

import type { CallMap, TopicMap } from '#extensions/contract';
import type {
  Call,
  Calls,
  ExtensionName,
  ServerMessage,
  Topic,
  Topics,
  WorkspaceRef,
} from '#lib/protocol';
import { SOCKET_PATH } from '#lib/socket-path';

export type Bica = Awaited<ReturnType<typeof startBica>>;
export type Tab = Awaited<ReturnType<typeof connect>>;

/**
 * Starts Bica on a free port. `root` holds its data and home folders; pass
 * the same one again to restart it on the same data.
 */
export async function startBica({ root }: { root?: string } = {}) {
  const owned = !root;
  root ??= await realpath(await mkdtemp(join(tmpdir(), 'bica-test-')));
  // Before any server module loads: they read these once, on import.
  Object.assign(process.env, {
    BICA_DATA_DIR: join(root, 'data'),
    // ~/.bica holds the user's own instructions and chats.
    HOME: join(root, 'home'),
    PI_MODEL: 'faux/faux-1',
    GIT_AUTHOR_NAME: 'Bica Test',
    GIT_AUTHOR_EMAIL: 'test@bica.invalid',
    GIT_COMMITTER_NAME: 'Bica Test',
    GIT_COMMITTER_EMAIL: 'test@bica.invalid',
    GIT_CONFIG_NOSYSTEM: '1',
  });
  // Unset, sessions are named from the prompt without a model call.
  delete process.env.PI_FAST_MODEL;

  const faux = fauxProvider({ tokensPerSecond: 0 });
  const { models } = await import('#server/providers');
  models.setProvider(faux.provider);
  const socket = await import('#server/socket');

  const server = createServer();
  socket.attach(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as { port: number };
  const sockets: WebSocket[] = [];

  return {
    root,
    port,
    /** Queues the model's next answers: messages, or functions of the context. */
    reply(...steps: FauxResponseStep[]) {
      faux.appendResponses(steps);
    },
    /**
     * Queues an answer that waits until `release`, so a test can act while
     * the agent works. `started` resolves once the model was called.
     */
    hold(answer: string | AssistantMessage = 'held answer') {
      const { promise: started, resolve: start } = Promise.withResolvers();
      const { promise: released, resolve: release } = Promise.withResolvers();
      faux.appendResponses([
        async (_context, options) => {
          start(undefined);
          // A real provider stops when the run is stopped.
          const signal = options?.signal;
          const aborted = new Promise((done) =>
            signal?.addEventListener('abort', done, { once: true }),
          );
          await Promise.race([released, aborted]);
          if (signal?.aborted)
            return fauxAssistantMessage('', {
              stopReason: 'aborted',
              errorMessage: 'Request was aborted',
            });
          return typeof answer === 'string'
            ? fauxAssistantMessage(answer)
            : answer;
        },
      ]);
      return { started, release: () => release(undefined) };
    },
    /** Opens a tab: a socket as the browser's, from Bica's own page. */
    async connect(options: { origin?: string } = {}) {
      const tab = await connect(port, options);
      sockets.push(tab.socket);
      return tab;
    },
    /** Adds a new empty folder under the root as a project. */
    async project(tab: Tab, name = 'project'): Promise<WorkspaceRef> {
      const cwd = join(root!, name);
      await mkdir(cwd, { recursive: true });
      return {
        projectId: await tab.request('project.add', { path: cwd }),
        cwd,
      };
    },
    async stop() {
      for (const ws of sockets) ws.close();
      server.close();
      if (owned) await rm(root!, { recursive: true, force: true });
    },
  };
}

/** Opens a tab on a Bica at `port`, such as one in another process. */
export async function connect(
  port: number,
  { origin = `http://127.0.0.1:${port}` }: { origin?: string } = {},
) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${SOCKET_PATH}`, {
    headers: { Origin: origin },
  } as never);
  await new Promise((open, fail) => {
    ws.onopen = open;
    ws.onerror = () => fail(new Error('Socket refused'));
  });
  return tab(ws);
}

function tab(ws: WebSocket) {
  const replies = new Map<string, (m: ServerMessage) => void>();
  const subs = new Map<number, (m: ServerMessage) => void>();
  let seq = 0;
  ws.onmessage = (event) => {
    const m = JSON.parse(String(event.data)) as ServerMessage;
    if (m.type === 'reply') replies.get(m.id)?.(m);
    else subs.get(m.sub)?.(m);
  };

  function request(
    call: Call | ExtensionName,
    args: unknown,
    id: string = crypto.randomUUID(),
  ) {
    return new Promise<unknown>((resolve, reject) => {
      replies.set(id, (m) => {
        replies.delete(id);
        if (m.type !== 'reply') return;
        if (m.ok) resolve(m.value);
        else reject(new Error(m.error));
      });
      ws.send(JSON.stringify({ type: 'request', id, call, args }));
    });
  }

  function watch<Value>(topic: Topic | ExtensionName, params: unknown) {
    const sub = ++seq;
    let value: Value | undefined;
    let error: string | undefined;
    const waiters = new Set<() => void>();
    subs.set(sub, (m) => {
      if (m.type === 'snapshot') value = m.value as Value;
      else if (m.type === 'changes')
        value = applyImmutable(value as never, m.ops) as Value;
      else if (m.type === 'error') error = m.error;
      for (const wake of waiters) wake();
    });
    ws.send(JSON.stringify({ type: 'subscribe', sub, topic, params }));
    return {
      get value() {
        return value;
      },
      /** Resolves with the value once `check` holds for it. */
      until(check: (value: Value) => unknown, ms = 4000): Promise<Value> {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            waiters.delete(test);
            const last = JSON.stringify(value, null, 1)?.slice(0, 3000);
            reject(new Error(`${topic} never matched. Last value:\n${last}`));
          }, ms);
          const test = () => {
            if (error) reject(new Error(error));
            else if (value === undefined || !check(value)) return;
            else resolve(value);
            clearTimeout(timer);
            waiters.delete(test);
          };
          waiters.add(test);
          test();
        });
      },
      stop() {
        subs.delete(sub);
        ws.send(JSON.stringify({ type: 'unsubscribe', sub }));
      },
    };
  }

  return {
    socket: ws,
    /** Sends a request; the same `id` twice is a re-send after a lost reply. */
    request: <C extends Call>(call: C, args: Calls[C]['args'], id?: string) =>
      request(call, args, id) as Promise<Calls[C]['result']>,
    /** Watches a topic, keeping its value current as the browser does. */
    watch: <T extends Topic>(topic: T, params: Topics[T]['params']) =>
      watch<Topics[T]['value']>(topic, params),
    /** An extension's own requests and topics, typed by the extension. */
    extension<C extends CallMap, T extends TopicMap>(id: string) {
      return {
        request: <K extends keyof C & string>(call: K, args: C[K]['args']) =>
          request(`ext:${id}/${call}`, args) as Promise<C[K]['result']>,
        watch: <K extends keyof T & string>(topic: K, params: T[K]['params']) =>
          watch<T[K]['value']>(`ext:${id}/${topic}`, params),
      };
    },
  };
}

/**
 * Whether a value, such as a transcript, shows this text anywhere. Tests
 * look for what the user would see, not where it sits in the data.
 */
export function shows(value: unknown, text: string) {
  return JSON.stringify(value ?? null).includes(
    JSON.stringify(text).slice(1, -1),
  );
}
