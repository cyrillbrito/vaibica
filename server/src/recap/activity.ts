import { isAbsolute, relative } from 'node:path';
import type { Message } from '@earendil-works/pi-ai';
import type { Cursor } from '@earendil-works/pi-durable';

import type { RecapActivity } from '@bica/shared/protocol';
import { context } from '../harness';
import { textOf } from '../sessions/read';
import { getConversation, summarize } from '../sessions/store';

// What the Recap tab reads from a transcript: the steps the fast model gets,
// and the counts that need no model.

// ponytail: looks back at most 3,000 entries.
const PAGES = 30;
const EDITS = new Set(['edit', 'write']);

export type Call = { name: string; summary: string; failed: boolean };
export type Step =
  | { kind: 'prompt' | 'reply'; text: string }
  | { kind: 'call'; call: Call };

/** Every message of a session, oldest first. */
async function messagesOf(id: string) {
  const conversation = await getConversation(id);
  const pages: Message[][] = [];
  let cursor: Cursor | undefined;
  for (let i = 0; i < PAGES; i++) {
    // Newest first.
    const page = await conversation.entries({}, 100, cursor, context);
    for (const entry of page.items)
      pages.push((entry.model ?? []) as Message[]);
    cursor = page.next;
    if (!cursor) break;
  }
  return pages.toReversed().flat();
}

function read(messages: Message[], cwd: string | null) {
  const steps: Step[] = [];
  const calls = new Map<string, Call>();
  const tools = new Map<string, number>();
  const files = new Map<string, { edits: number; last: number }>();
  let prompts = 0;
  let replies = 0;
  let order = 0;
  const touch = (path: string) => {
    const shown = cwd && isAbsolute(path) ? relative(cwd, path) : path;
    const f = files.get(shown) ?? { edits: 0, last: 0 };
    f.edits++;
    f.last = order++;
    files.set(shown, f);
  };
  for (const m of messages) {
    if (m.role === 'user') {
      const text = textOf(m.content);
      if (!text) continue;
      prompts++;
      steps.push({ kind: 'prompt', text });
    } else if (m.role === 'assistant') {
      const text = textOf(m.content);
      if (text) {
        replies++;
        steps.push({ kind: 'reply', text });
      }
      for (const block of m.content) {
        if (block.type !== 'toolCall') continue;
        const args = block.arguments as Record<string, unknown>;
        const call: Call = {
          name: block.name,
          summary: typeof args.summary === 'string' ? args.summary : '',
          failed: false,
        };
        calls.set(block.id, call);
        tools.set(block.name, (tools.get(block.name) ?? 0) + 1);
        steps.push({ kind: 'call', call });
        if (EDITS.has(block.name) && typeof args.path === 'string')
          touch(args.path);
        // Code mode's scripts call edit and write too.
        for (const value of Object.values(args))
          if (typeof value === 'string')
            for (const match of value.matchAll(
              /tools\.(?:edit|write)\(\s*\{[^}]*?\bpath:\s*(["'`])(.+?)\1/g,
            ))
              touch(match[2]!);
      }
    } else if (m.role === 'toolResult' && m.isError) {
      const call = calls.get(m.toolCallId);
      if (call) call.failed = true;
    }
  }
  const stamps = messages.map((m) => m.timestamp).filter(Boolean);
  const activity: RecapActivity = {
    prompts,
    replies,
    calls: calls.size,
    failed: [...calls.values()].filter((c) => c.failed).length,
    tools: [...tools]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    files: [...files]
      .sort((a, b) => b[1].last - a[1].last)
      .map(([path, f]) => ({ path, edits: f.edits })),
    startedAt: stamps.length ? Math.min(...stamps) : null,
    lastAt: stamps.length ? Math.max(...stamps) : null,
  };
  return { steps, activity };
}

/** A session's steps and counts, with its title and status. */
export async function readSession(id: string) {
  const [messages, conversation] = await Promise.all([
    messagesOf(id),
    getConversation(id),
  ]);
  const summary = await summarize(conversation.id);
  return {
    ...read(messages, summary?.cwd ?? null),
    title: summary?.title ?? '',
    status: summary?.status ?? 'idle',
  };
}

export async function sessionActivity(id: string) {
  return (await readSession(id)).activity;
}
