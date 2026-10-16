import { strict as assert } from 'node:assert';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
if (!url || !process.env.TAU_TEST_ALLOW_PROJECTS)
  throw new Error(
    'Pass an isolated test WebSocket URL and TAU_TEST_ALLOW_PROJECTS=1',
  );
const cwd = await realpath(await mkdtemp(join(tmpdir(), 'tau-bun-')));
const ws = new WebSocket(url, {
  headers: { Origin: new URL(url).origin.replace(/^ws/, 'http') },
} as never);
const pending = new Map<string, (message: any) => void>();
const output = new Map<number, string>();
let seq = 0;
ws.onmessage = (event) => {
  const message = JSON.parse(String(event.data));
  if (message.type === 'snapshot' && message.value?.output != null)
    output.set(message.sub, message.value.output);
  if (message.type === 'changes') {
    for (const op of message.ops)
      if (op[0] === 'a' && op[1]?.[0] === 'output')
        output.set(message.sub, (output.get(message.sub) || '') + op[2]);
  }
  if (message.type === 'reply') pending.get(message.id)?.(message);
};
await new Promise<void>((resolve, reject) => {
  ws.onopen = () => resolve();
  ws.onerror = reject;
});
async function request(call: string, args: object) {
  const id = `${crypto.randomUUID()}:${++seq}`;
  const reply = new Promise<any>((resolve) => pending.set(id, resolve));
  ws.send(JSON.stringify({ type: 'request', id, call, args }));
  const result = await Promise.race([
    reply,
    Bun.sleep(10000).then(() => {
      throw new Error(`Timed out: ${call}`);
    }),
  ]);
  pending.delete(id);
  if (!result.ok) throw new Error(`${call}: ${result.error}`);
  return result.value;
}
async function until(sub: number, phrase: string) {
  for (let i = 0; i < 100; i++) {
    if (output.get(sub)?.includes(phrase)) return;
    await Bun.sleep(50);
  }
  throw new Error(`Missing ${phrase}: ${output.get(sub)?.slice(-300)}`);
}
try {
  const projectId = await request('project.add', { path: cwd });
  const ref = { projectId, cwd };
  const id = await request('terminal.create', {
    ...ref,
    command: 'printf "héllo 🌈\\n"; stty size; cat',
  });
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      sub: 99,
      topic: 'terminal',
      params: { id },
    }),
  );
  await until(99, 'héllo 🌈');
  await request('terminal.resize', { id, cols: 83, rows: 27 });
  await request('terminal.input', { id, data: 'ping 🌈\n' });
  await until(99, 'ping 🌈');
  await request('terminal.input', { id, data: '\u0003' });
  await until(99, 'exited with code');
  await request('terminal.remove', { id });
  const flood = await request('terminal.create', {
    ...ref,
    command: 'yes x | head -c 1200000',
  });
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      sub: 100,
      topic: 'terminal',
      params: { id: flood },
    }),
  );
  await until(100, 'exited with code');
  assert.ok((output.get(100)?.length || 0) <= 1000100, 'output cap');
  await request('terminal.remove', { id: flood });
  const tree = await request('terminal.create', {
    ...ref,
    command: 'sleep 60 & echo CHILD:$!; wait',
  });
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      sub: 101,
      topic: 'terminal',
      params: { id: tree },
    }),
  );
  await until(101, 'CHILD:');
  const pid = Number(output.get(101)?.match(/CHILD:(\d+)/)?.[1]);
  assert.ok(pid > 0);
  await request('terminal.stop', { id: tree });
  await Bun.sleep(100);
  try {
    process.kill(pid, 0);
    throw new Error(`Descendant ${pid} survived stop`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
  await request('terminal.remove', { id: tree });
  const rejected = new WebSocket(url, {
    headers: { Origin: 'https://malicious.example' },
  } as never);
  const outcome = await Promise.race([
    new Promise<string>((resolve) => {
      rejected.onopen = () => resolve('opened');
      rejected.onerror = () => resolve('rejected');
    }),
    Bun.sleep(3000).then(() => 'timeout'),
  ]);
  rejected.close();
  assert.equal(outcome, 'rejected', 'cross-site handshake must fail');
  const reconnect = new WebSocket(url);
  const snapshot = new Promise<any>((resolve, reject) => {
    reconnect.onerror = reject;
    reconnect.onopen = () =>
      reconnect.send(
        JSON.stringify({
          type: 'subscribe',
          sub: 1,
          topic: 'sessions',
          params: {},
        }),
      );
    reconnect.onmessage = (event) => resolve(JSON.parse(String(event.data)));
  });
  assert.equal((await snapshot).type, 'snapshot');
  reconnect.close();
  console.log(
    'Bun socket and PTY: Unicode, input, resize, Ctrl-C, flood cap, reconnect, origin rejection passed',
  );
} finally {
  ws.close();
  await rm(cwd, { recursive: true, force: true });
}
