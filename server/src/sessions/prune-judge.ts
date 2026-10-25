import type { Message, ToolCall } from '@earendil-works/pi-ai';
import type { EntryRecord } from '@earendil-works/pi-durable';

import { KEEP_OUTPUT, chars, isCleared, oldCalls } from '@bica/shared/prune';
import { decide, hasDecisionModel } from '#server/providers';

// Smart pruning: with a decision model set (Settings → Models), it reads the
// whole session and names the old tool outputs that must stay word for word. The rest clear as usual. Modeled on
// fast-jev-compaction (docs/context-usage.md), with its two questions cut to
// one, since pruning never removes a call.

const CONTEXT =
  'A coding assistant session is being cleaned up to free context. `history` is the conversation so far, oldest first; long texts are abridged, and each tool call is one line with its id, input, and the start of its output. Old outputs get replaced by a short note with their start and end, unless kept. The assistant can always run a tool again or reread a file.';

// Jev reads up to 32k tokens per question; this leaves room for the question.
const STATE_CHARS = 60_000;
const KEEP_AT = 0.5;
// A chat model standing in takes seconds; Jev well under one.
const TIMEOUT = 30_000;

// Tighter each round, until the history fits.
const STAGES = [
  { text: 600, input: 200, preview: 200 },
  { text: 200, input: 120, preview: 80 },
  { text: 100, input: 60, preview: 0 },
];

type Candidate = { tag: string; toolCallId: string };

/**
 * Tool call ids whose output should stay verbatim. Empty without a decision
 * model, and when it fails: pruning then clears everything.
 */
export async function keepers(
  entries: readonly EntryRecord[],
  current: (entry: EntryRecord) => readonly Message[] | undefined,
): Promise<Set<string>> {
  if (!hasDecisionModel()) return new Set();
  const messages = entries.flatMap((e) => current(e) ?? []);
  const old = oldCalls(entries, current);
  const candidates: Candidate[] = [];
  const tags = new Map<string, string>();
  for (const m of messages)
    if (m.role === 'assistant')
      for (const b of m.content)
        if (b.type === 'toolCall') tags.set(b.id, `t${tags.size + 1}`);
  for (const m of messages)
    if (
      m.role === 'toolResult' &&
      old.has(m.toolCallId) &&
      tags.has(m.toolCallId) &&
      chars(m) > KEEP_OUTPUT &&
      !isCleared(m) &&
      m.content.every((b) => b.type === 'text')
    )
      candidates.push({
        tag: tags.get(m.toolCallId)!,
        toolCallId: m.toolCallId,
      });
  if (!candidates.length) return new Set();

  try {
    const state = { context: CONTEXT, ...fit(messages, tags) };
    const calls = new Map(
      messages.flatMap((m) =>
        m.role === 'assistant'
          ? m.content.flatMap((b) => (b.type === 'toolCall' ? [[b.id, b]] : []))
          : [],
      ) as [string, ToolCall][],
    );
    const sizes = new Map(
      messages.flatMap((m) =>
        m.role === 'toolResult' ? [[m.toolCallId, chars(m)]] : [],
      ) as [string, number][],
    );
    const answers = await decide(
      state,
      Object.fromEntries(
        candidates.map((c) => [
          c.tag,
          {
            instructions: `The full output of tool call ${c.tag} (${calls.get(c.toolCallId)?.name ?? 'tool'}, ${sizes.get(c.toolCallId)} chars) must stay in the history word for word: the assistant still needs its exact contents for the work that remains, and running the tool again would not do.`,
            yes: 'Keep the full output',
            no: 'A short note with its start and end is enough',
          },
        ]),
      ),
      AbortSignal.timeout(TIMEOUT),
    );
    return new Set(
      candidates
        .filter((c) => (answers[c.tag] ?? 0) >= KEEP_AT)
        .map((c) => c.toolCallId),
    );
  } catch (error) {
    console.error('[prune] decision model failed, clearing all:', error);
    return new Set();
  }
}

/** The goal and the history, abridged until they fit Jev's window. */
function fit(messages: readonly Message[], tags: Map<string, string>) {
  const prompts = messages.flatMap((m) =>
    m.role === 'user' ? [clip(textOf(m.content), 500)] : [],
  );
  const goal = prompts.slice(-3);
  for (const stage of STAGES) {
    const history = render(messages, tags, stage);
    if (JSON.stringify(history).length <= STATE_CHARS) return { goal, history };
  }
  // Still too long: the oldest lines go, and Jev is told they did.
  const history = render(messages, tags, STAGES.at(-1)!);
  let size = JSON.stringify(history).length;
  let cut = 0;
  while (size > STATE_CHARS && cut < history.length - 1)
    size -= JSON.stringify(history[cut++]).length + 1;
  return {
    goal,
    history: [`[${cut} older lines omitted]`, ...history.slice(cut)],
  };
}

function render(
  messages: readonly Message[],
  tags: Map<string, string>,
  stage: (typeof STAGES)[number],
) {
  const results = new Map(
    messages.flatMap((m) =>
      m.role === 'toolResult' ? [[m.toolCallId, m]] : [],
    ),
  );
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === 'user')
      lines.push(`user: ${clip(textOf(m.content), stage.text)}`);
    if (m.role !== 'assistant') continue;
    const text = m.content
      .flatMap((b) => (b.type === 'text' ? b.text : []))
      .join('\n');
    if (text.trim()) lines.push(`assistant: ${clip(text, stage.text)}`);
    for (const b of m.content) {
      if (b.type !== 'toolCall') continue;
      const r = results.get(b.id);
      const out = r ? textOf(r.content) : '';
      const status = !r
        ? 'no result'
        : `${r.isError ? 'error' : 'ok'}, ${chars(r)} chars${isCleared(r) ? ', already cleared' : ''}`;
      const preview =
        stage.preview && out && !isCleared(r!)
          ? `: ${clip(out, stage.preview)}`
          : '';
      lines.push(
        `${tags.get(b.id)} ${b.name} ${clip(JSON.stringify(b.arguments), stage.input)} → ${status}${preview}`,
      );
    }
  }
  return lines;
}

function textOf(content: Message['content']) {
  if (typeof content === 'string') return content;
  return content.flatMap((b) => (b.type === 'text' ? b.text : [])).join('\n');
}

function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const head = Math.ceil(max * 0.7);
  return `${flat.slice(0, head)} […] ${flat.slice(-(max - head))}`;
}
