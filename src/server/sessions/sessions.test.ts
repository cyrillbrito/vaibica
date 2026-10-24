import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';

import { shows, startBica, type Bica, type Tab } from '../../testing/bica';

let bica: Bica;
beforeAll(async () => {
  bica = await startBica();
});
afterAll(() => bica?.stop());

async function newSession(tab: Tab, prompt: string, requestId?: string) {
  const { projectId } = await bica.project(tab);
  return tab.request(
    'session.create',
    { projectId, prompt, requestId: crypto.randomUUID() },
    requestId,
  );
}

const statusOf = (tab: Tab, id: string) => {
  const sessions = tab.watch('sessions', {});
  return (status: string) =>
    sessions.until((list) =>
      list.some((s) => s.id === id && s.status === status),
    );
};

test('a prompt gets an answer, and the session ends done', async () => {
  const tab = await bica.connect();
  bica.reply(fauxAssistantMessage('Hello from the agent'));
  const id = await newSession(tab, 'Say hello');
  await tab
    .watch('conversation', { id })
    .until((c) => shows(c, 'Hello from the agent'));
  await statusOf(tab, id)('done');
});

test('a prompt sent while the agent works runs after the current answer', async () => {
  const tab = await bica.connect();
  // Two steps, so a prompt that joined the run early would show before the
  // first answer instead of after it.
  const first = bica.hold(
    fauxAssistantMessage(
      fauxToolCall('bash', { command: 'true', summary: 'Check' }),
      { stopReason: 'toolUse' },
    ),
  );
  bica.reply(
    fauxAssistantMessage('first answer'),
    fauxAssistantMessage('second answer'),
  );
  const id = await newSession(tab, 'first prompt');
  await first.started;
  await tab.request('session.submit', {
    id,
    prompt: 'second prompt',
    requestId: crypto.randomUUID(),
  });
  first.release();
  const conversation = await tab
    .watch('conversation', { id })
    .until((c) => shows(c, 'second answer'));
  const text = JSON.stringify(conversation);
  const order = [
    'first prompt',
    'first answer',
    'second prompt',
    'second answer',
  ];
  const at = order.map((s) => text.indexOf(s));
  expect(at).toEqual(at.toSorted((a, b) => a - b));
});

test('stop ends the run and hands queued prompts back', async () => {
  const tab = await bica.connect();
  const run = bica.hold();
  const id = await newSession(tab, 'long job');
  await run.started;
  await tab.request('session.submit', {
    id,
    prompt: 'queued for later',
    requestId: crypto.randomUUID(),
  });
  const returned = await tab.request('session.stop', { id });
  expect(returned.map((q) => q.prompt)).toEqual(['queued for later']);
  await tab
    .watch('sessions', {})
    .until((l) => l.some((s) => s.id === id && s.status !== 'running'));
  // The next prompt runs on its own: the dropped one never reaches the model.
  bica.reply(fauxAssistantMessage('fresh answer'));
  await tab.request('session.submit', {
    id,
    prompt: 'fresh start',
    requestId: crypto.randomUUID(),
  });
  const conversation = await tab
    .watch('conversation', { id })
    .until((c) => shows(c, 'fresh answer'));
  expect(shows(conversation, 'queued for later')).toBe(false);
});

test('a phone that reconnects and resends its request gets one session with everything in it', async () => {
  const phone = await bica.connect();
  bica.reply(fauxAssistantMessage('answer for the phone'));
  const requestId = crypto.randomUUID();
  const id = await newSession(phone, 'from the phone', requestId);
  // The reply was lost: the new socket sends the same request again.
  const again = await bica.connect();
  expect(await newSession(again, 'from the phone', requestId)).toBe(id);
  await again
    .watch('conversation', { id })
    .until((c) => shows(c, 'answer for the phone'));
  const list = await again.watch('sessions', {}).until(() => true);
  expect(list.filter((s) => shows(s, 'from the phone'))).toHaveLength(1);
});
