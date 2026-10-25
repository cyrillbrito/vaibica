import { afterAll, beforeAll, expect, test } from 'bun:test';

import { startBica, type Bica } from '../testing/bica';

let bica: Bica;
beforeAll(async () => {
  bica = await startBica();
});
afterAll(() => bica?.stop());

test('a terminal streams its output and takes input', async () => {
  const tab = await bica.connect();
  const ref = await bica.project(tab);
  const id = await tab.request('terminal.create', {
    ...ref,
    command: 'printf "héllo 🌈\\n"; cat',
  });
  const screen = tab.watch('terminal', { id });
  await screen.until((t) => t?.output.includes('héllo 🌈'));
  await tab.request('terminal.input', { id, data: 'ping 🌈\n' });
  await screen.until((t) => t?.output.includes('ping 🌈'));
  await tab.request('terminal.remove', { id });
});

test('stopping a terminal ends the processes its command started', async () => {
  const tab = await bica.connect();
  const ref = await bica.project(tab);
  const id = await tab.request('terminal.create', {
    ...ref,
    command: 'sleep 60 & echo CHILD:$!; wait',
  });
  const screen = await tab
    .watch('terminal', { id })
    .until((t) => /CHILD:\d+/.test(t?.output ?? ''));
  const pid = Number(screen!.output.match(/CHILD:(\d+)/)![1]);
  await tab.request('terminal.stop', { id });
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let i = 0; i < 40 && alive(); i++) await Bun.sleep(25);
  expect(alive()).toBe(false);
  await tab.request('terminal.remove', { id });
});
