import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { TranscriptContext } from '@earendil-works/pi-ai';
import { fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';

import { startBica, type Bica } from '../../testing/bica';

let bica: Bica;
beforeAll(async () => {
  bica = await startBica();
});
afterAll(() => bica?.stop());

// The tools a request offers: system messages add and remove them in order.
function toolsOf(context: TranscriptContext) {
  const tools = new Set<string>();
  for (const m of context.messages)
    if (m.role === 'system') {
      for (const t of m.toolsAdded ?? []) tools.add(t.name);
      for (const t of m.toolsRemoved ?? []) tools.delete(t.name);
    }
  return [...tools];
}

test('switching web search off takes its tools from the next request, and on brings them back', async () => {
  const tab = await bica.connect();
  const seen: string[][] = [];
  const answer = (text: string) =>
    bica.reply((context) => {
      seen.push(toolsOf(context));
      return fauxAssistantMessage(text);
    });
  const conversation = (id: string) => tab.watch('conversation', { id });
  const answered = (id: string, n: number) =>
    conversation(id).until(() => seen.length === n);

  answer('first');
  const { projectId } = await bica.project(tab);
  const id = await tab.request('session.create', {
    projectId,
    prompt: 'one',
    requestId: crypto.randomUUID(),
  });
  await answered(id, 1);
  expect(seen[0]).toContain('web_search');

  await tab.request('extension.update', { id: 'web', on: false });
  await tab
    .watch('extensions', {})
    .until((list) => list.some((e) => e.id === 'web' && !e.on));
  answer('second');
  await tab.request('session.submit', {
    id,
    prompt: 'two',
    requestId: crypto.randomUUID(),
  });
  await answered(id, 2);
  expect(seen[1]).not.toContain('web_search');
  expect(seen[1]).not.toContain('web_fetch');
  expect(seen[1]).toContain('bash');

  await tab.request('extension.update', { id: 'web', on: true });
  answer('third');
  await tab.request('session.submit', {
    id,
    prompt: 'three',
    requestId: crypto.randomUUID(),
  });
  await answered(id, 3);
  expect(seen[2]).toContain('web_fetch');
});

test('a saved key shows only by its last characters, and removing it clears it', async () => {
  const tab = await bica.connect();
  const extensions = tab.watch('extensions', {});
  const key = 'exa-test-key-1234567890abcd';
  await tab.request('extension.update', {
    id: 'web',
    settings: { exa: key },
  });
  const saved = await extensions.until((list) =>
    list.some((e) => e.id === 'web' && e.settings.exa?.saved),
  );
  expect(saved.find((e) => e.id === 'web')!.settings.exa).toEqual({
    saved: true,
    hint: 'abcd',
  });
  expect(JSON.stringify(saved)).not.toContain(key);

  await tab.request('extension.update', { id: 'web', settings: { exa: null } });
  await extensions.until((list) =>
    list.some((e) => e.id === 'web' && e.settings.exa?.saved === false),
  );
});
