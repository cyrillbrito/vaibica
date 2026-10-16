import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { Type } from '@earendil-works/pi-ai';

const [phase, dir] = process.argv.slice(2);
if (!phase) {
  const scratch = await mkdtemp(join(tmpdir(), 'bica-recovery-'));
  const child = (mode: string) =>
    Bun.spawn(['bun', import.meta.path, mode, scratch], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  try {
    const first = child('begin');
    const marker = join(scratch, 'unsafe.count');
    for (let i = 0; i < 200; i++) {
      if (await Bun.file(marker).exists()) break;
      if (first.exitCode !== null)
        throw new Error(
          `Child exited early: ${await new Response(first.stderr).text()}`,
        );
      await Bun.sleep(25);
    }
    assert.ok(
      await Bun.file(marker).exists(),
      'both tools started before crash',
    );
    first.kill('SIGKILL');
    await first.exited;
    const recovery = child('recover');
    const code = await Promise.race([
      recovery.exited,
      Bun.sleep(15000).then(() => {
        recovery.kill();
        throw Error('recovery timed out');
      }),
    ]);
    assert.equal(code, 0, await new Response(recovery.stderr).text());
    console.log((await new Response(recovery.stdout).text()).trim());
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
} else {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = createRegistry();
  const count = async (name: string) => {
    const file = join(dir, `${name}.count`);
    const n = Number(await readFile(file, 'utf8').catch(() => '0')) + 1;
    await writeFile(file, String(n));
    if (phase === 'begin') await Bun.sleep(60000);
    return { content: [{ type: 'text' as const, text: name }] };
  };
  registry.install(
    defineExtension({
      name: 'recovery',
      tools: [
        defineTool({
          name: 'safe',
          description: 'Safe tool',
          replay: 'safe',
          parameters: Type.Object({}),
          execute: () => count('safe'),
        }),
        defineTool({
          name: 'unsafe',
          description: 'Unsafe tool',
          parameters: Type.Object({}),
          execute: () => count('unsafe'),
        }),
      ],
    }),
  );
  const harness = await Harness.open(
    await openNodeSqliteStorage(join(dir, 'harness.sqlite')),
    { models, registry },
    ctx,
  );
  if (phase === 'begin') {
    faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall('safe', {}), fauxToolCall('unsafe', {})],
        { stopReason: 'toolUse' },
      ),
    ]);
    const root = await harness.createConversation(
      {
        ownership: { kind: 'ownerless' },
        agent: { model: { provider: 'faux', modelId: 'faux-1' } },
      },
      ctx,
    );
    await writeFile(join(dir, 'id'), String(root.id));
    await root.submit(
      { type: 'input', content: 'run tools', requestId: 'crash-id' },
      ctx,
    );
  } else {
    faux.setResponses([fauxAssistantMessage('recovered')]);
    const root = (await harness.conversation(
      Number(await readFile(join(dir, 'id'), 'utf8')) as never,
      ctx,
    ))!;
    harness.resume();
    const again = await root.submit(
      { type: 'input', content: 'run tools', requestId: 'crash-id' },
      ctx,
    );
    assert.equal((await again.wait(ctx)).status, 'done');
    assert.equal(Number(await readFile(join(dir, 'safe.count'), 'utf8')), 2);
    assert.equal(Number(await readFile(join(dir, 'unsafe.count'), 'utf8')), 1);
    console.log(
      'Crash recovery: safe tool replayed, unsafe tool interrupted, duplicate request ID reused',
    );
    await harness.close(ctx);
  }
}
