import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';

import { shows, startBica, type Bica } from '../testing/bica';

let bica: Bica;
beforeAll(async () => {
  bica = await startBica();
});
afterAll(() => bica?.stop());

test("the agent's edits show as changes, and a commit records them", async () => {
  const tab = await bica.connect();
  const ref = await bica.project(tab);
  const status = tab.watch('git.status', ref);
  await status.until((s) => s?.unstaged.length === 0);

  bica.reply(
    fauxAssistantMessage(
      fauxToolCall('write', {
        path: 'notes.md',
        content: 'written by the agent\n',
        summary: 'Write notes',
      }),
      { stopReason: 'toolUse' },
    ),
    fauxAssistantMessage('Wrote the notes'),
  );
  await tab.request('session.create', {
    ...ref,
    prompt: 'Write notes.md',
    requestId: crypto.randomUUID(),
  });
  await status.until((s) => shows(s?.unstaged, 'notes.md'));
  const file = await tab.request('file.read', { ...ref, path: 'notes.md' });
  expect(shows(file, 'written by the agent')).toBe(true);

  await tab.request('git.commit', { ...ref, message: 'Add notes', all: true });
  const after = await status.until((s) => shows(s?.recent, 'Add notes'));
  expect([...after!.staged, ...after!.unstaged]).toEqual([]);
});
