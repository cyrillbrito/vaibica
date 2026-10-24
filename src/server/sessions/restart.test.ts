import { afterAll, beforeAll, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { connect, shows } from '../../testing/bica';

let root: string;
beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'bica-restart-')));
});
afterAll(() => rm(root, { recursive: true, force: true }));

/** Bica in its own process, on the same data each time. */
async function launch(...mode: string[]) {
  const child = Bun.spawn(
    [
      'bun',
      '--preload',
      './src/testing/preload.ts',
      './src/testing/serve.ts',
      root,
      ...mode,
    ],
    { stdout: 'pipe', stderr: 'inherit' },
  );
  const reader = child.stdout.getReader();
  let out = '';
  while (!/port \d+/.test(out)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`Bica exited before listening: ${out}`);
    out += new TextDecoder().decode(value);
  }
  return { child, port: Number(out.match(/port (\d+)/)![1]) };
}

test('a run cut off by a crash finishes after Bica restarts', async () => {
  const first = await launch('hang');
  const cwd = join(root, 'project');
  await mkdir(cwd);
  const tab = await connect(first.port);
  const projectId = await tab.request('project.add', { path: cwd });
  const id = await tab.request('session.create', {
    projectId,
    prompt: 'Work through the crash',
    requestId: crypto.randomUUID(),
  });
  await tab
    .watch('sessions', {})
    .until((l) => l.some((s) => s.id === id && s.status === 'running'));
  first.child.kill('SIGKILL');
  await first.child.exited;

  const second = await launch('answer', 'Finished after the restart');
  try {
    const again = await connect(second.port);
    await again
      .watch('conversation', { id })
      .until((c) => shows(c, 'Finished after the restart'), 10_000);
  } finally {
    second.child.kill();
    await second.child.exited;
  }
}, 20_000);
