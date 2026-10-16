import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import {
  fauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
} from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { CodemodeSandbox } from '@earendil-works/pi-codemode';
import { Type } from '@earendil-works/pi-ai';

const dir = await mkdtemp(join(tmpdir(), 'tau-durable-bun-'));
const file = join(dir, 'test.sqlite');
const faux = fauxProvider({ tokensPerSecond: 50 });
const models = createModels();
models.setProvider(faux.provider);
const registry = createRegistry();
let tools = 0;
registry.install(
  defineExtension({
    name: 'test',
    tools: [
      defineTool({
        name: 'check',
        description: 'Count calls',
        parameters: Type.Object({}),
        replay: 'safe',
        async execute() {
          tools++;
          return { content: [{ type: 'text', text: 'checked' }] };
        },
      }),
    ],
  }),
);
const open = async () =>
  Harness.open(await openNodeSqliteStorage(file), { models, registry }, ctx);
let harness = await open();
try {
  const root = await harness.createConversation(
    {
      ownership: { kind: 'ownerless' },
      agent: { model: { provider: 'faux', modelId: 'faux-1' } },
    },
    ctx,
  );
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('check', {}), { stopReason: 'toolUse' }),
    fauxAssistantMessage('done'),
    fauxAssistantMessage('follow-up'),
  ]);
  const watch = await root.watch(ctx);
  let frames = 0;
  watch.start(async () => {
    frames++;
  });
  const first = await root.submit(
    { type: 'input', content: 'tool', requestId: 'same-request' },
    ctx,
  );
  const second = await root.submit({ type: 'input', content: 'next' }, ctx);
  assert.equal((await first.wait(ctx)).status, 'done');
  assert.equal((await second.wait(ctx)).status, 'done');
  assert.equal(tools, 1);
  assert.ok(frames > 1, 'committed streaming updates');
  await watch.stop();
  faux.appendResponses([fauxAssistantMessage('summary of earlier work')]);
  const compactId = await root.compact('Summarize earlier work', ctx);
  const compacted = await harness.waitForTask(compactId, ctx);
  assert.equal(compacted.state.outcome.status, 'completed');
  const entries = (await root.viewState(ctx)).value.entries;
  const fork = await root.fork(
    entries.at(-1)!.id,
    { ownership: { kind: 'ownerless' } },
    ctx,
  );
  assert.ok((await fork.viewState(ctx)).value.entries.length >= 2);
  faux.appendResponses([
    fauxAssistantMessage('a slow streaming response '.repeat(40)),
    fauxAssistantMessage('steered'),
  ]);
  const running = await root.submit(
    { type: 'input', content: 'slow stream' },
    ctx,
  );
  await Bun.sleep(80);
  const steer = await root.submit(
    { type: 'input', content: 'change course', whenBusy: 'steer' },
    ctx,
  );
  await root.abort(ctx);
  assert.notEqual((await running.wait(ctx)).status, 'done');
  assert.notEqual((await steer.wait(ctx)).status, 'done');
  const id = root.id;
  await harness.close(ctx);
  harness = await open();
  const resumed = await harness.conversation(id, ctx);
  assert.ok(resumed);
  const duplicate = await resumed!.submit(
    { type: 'input', content: 'tool', requestId: 'same-request' },
    ctx,
  );
  assert.equal(duplicate.id, first.id);
  assert.equal(tools, 1);
  console.log(
    'Durable: SQLite reopen, streamed watch, tool, queue, fork, duplicate ID passed',
  );

  const sandbox = new CodemodeSandbox({
    timeoutMs: 100,
    tools: [
      { name: 'ok', execute: async () => 'yes' },
      {
        name: 'fail',
        execute: async () => {
          throw Error('expected');
        },
      },
    ],
  });
  try {
    assert.equal((await sandbox.execute('text(await tools.ok({}))')).ok, true);
    assert.equal((await sandbox.execute('await tools.fail({})')).ok, false);
    const timed = await sandbox.execute('while (true) {}');
    assert.equal(timed.ok ? '' : timed.error.kind, 'timeout');
    const controller = new AbortController();
    const spinning = sandbox.execute('while (true) {}', {
      signal: controller.signal,
    });
    controller.abort();
    const cancelled = await spinning;
    assert.equal(cancelled.ok ? '' : cancelled.error.kind, 'aborted');
    console.log(
      'Codemode: success, nested failure, infinite-loop timeout and abort passed',
    );
  } finally {
    await sandbox.close();
  }
} finally {
  await harness.close(ctx);
  await rm(dir, { recursive: true, force: true });
}
