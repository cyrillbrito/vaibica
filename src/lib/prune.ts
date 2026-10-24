// Pruning: clears old tool output from the model context, without a model
// call (docs/context-usage.md). Shared by the server, which writes the edits,
// and the browser, which shows what they would save.
import type {
  AssistantMessage,
  Message,
  ToolCall,
  ToolResultMessage,
} from '@earendil-works/pi-ai';
import type { ContextEdit, EntryRecord } from '@earendil-works/pi-durable';

export const PRUNE_HINT =
  'Clears old tool output and images from what the model reads, so the next prompt sends less. Your prompts, the replies and the reasoning stay, and the transcript keeps everything.';

/**
 * The entry that carries the edits; it adds nothing to the context itself.
 * Sessions store it, so its kind keeps the name from when pruning was called
 * clean up.
 */
export const PRUNE_ENTRY = 'bica.cleanup';

// pi-ai's estimate, as in context-usage.ts.
export const IMAGE_CHARS = 4800;

// Outputs and arguments this short stay as they are: they cost little and
// often carry the point ("Edited 2 files", a path, a short command).
export const KEEP_OUTPUT = 300;
const KEEP_ARG = 120;
// A cleared output keeps its start and end: on replays of real sessions no
// selector kept the lines the agent needed later better than these
// (docs/context-usage.md). Below PREVIEW_FROM the note alone is enough.
const PREVIEW_FROM = 1500;
const HEAD = 160;
const TAIL = 80;
const NOTE = '[Old output cleared to save context';

/** Whether a result is already a pruning note, so it isn't cleared again. */
export const isCleared = (message: ToolResultMessage) =>
  message.content[0]?.type === 'text' &&
  message.content[0].text.startsWith(NOTE);

/** Characters a message adds to the context, as context-usage.ts counts them. */
export function chars(message: Message): number {
  if (message.role === 'toolResult')
    return message.content.reduce(
      (n, b) => n + (b.type === 'text' ? b.text.length : IMAGE_CHARS),
      0,
    );
  if (message.role !== 'assistant') return 0;
  return message.content.reduce(
    (n, b) =>
      n +
      (b.type === 'toolCall'
        ? b.name.length + JSON.stringify(b.arguments).length
        : 0),
    0,
  );
}

// The newest messages stay whole, as in fast-jev-compaction: the answer and
// its last steps are what a follow-up refers to. Older steps clear even
// inside a long turn.
export const KEEP_RECENT = 6;

/**
 * The ids of the tool calls pruning may touch: all but the newest
 * KEEP_RECENT messages. A call counts as recent when its call or its output is.
 */
export function oldCalls(
  entries: readonly EntryRecord[],
  current: (entry: EntryRecord) => readonly Message[] | undefined,
): Set<string> {
  const messages = entries.flatMap((e) => current(e) ?? []);
  const recent = new Set<string>();
  for (const m of messages.slice(-KEEP_RECENT)) {
    if (m.role === 'toolResult') recent.add(m.toolCallId);
    if (m.role === 'assistant')
      for (const b of m.content) if (b.type === 'toolCall') recent.add(b.id);
  }
  const old = new Set<string>();
  for (const m of messages.slice(0, -KEEP_RECENT))
    if (m.role === 'toolResult' && !recent.has(m.toolCallId))
      old.add(m.toolCallId);
  return old;
}

/**
 * Edits that prune all but the newest messages (KEEP_RECENT): tool output
 * and images give way to a note, and long tool arguments shrink to their
 * summary and first line. Prompts, thinking and replies stay. `current` is
 * what each entry adds to the context now, after earlier edits. Outputs whose
 * tool call id is in `keep` stay verbatim (src/server/sessions/prune-judge.ts).
 */
export function pruneEdits(
  entries: readonly EntryRecord[],
  current: (entry: EntryRecord) => readonly Message[] | undefined,
  keep: ReadonlySet<string> = new Set(),
): ContextEdit[] {
  const old = oldCalls(entries, current);
  const edits: ContextEdit[] = [];
  for (const entry of entries) {
    const messages = current(entry);
    if (!messages) continue;
    const cleaned = messages.map((m) => {
      if (m.role === 'toolResult')
        return old.has(m.toolCallId) && !keep.has(m.toolCallId)
          ? pruneResult(m)
          : m;
      if (m.role === 'assistant') return pruneCalls(m, old);
      return m;
    });
    if (cleaned.some((m, i) => m !== messages[i]))
      edits.push({ target: entry.id, action: 'replace', messages: cleaned });
  }
  return edits;
}

function pruneResult(message: ToolResultMessage): ToolResultMessage {
  const size = chars(message);
  const image = message.content.some((b) => b.type === 'image');
  if ((size <= KEEP_OUTPUT && !image) || isCleared(message)) return message;
  const { details: _details, nestedCalls: _nested, ...rest } = message;
  const text = message.content
    .flatMap((b) => (b.type === 'text' ? b.text : []))
    .join('\n')
    .trim();
  const note = `${NOTE}, ~${Math.round(size / 4)} tokens. Run the tool again if you need it.]`;
  return {
    ...rest,
    content: [
      {
        type: 'text',
        text:
          text.length < PREVIEW_FROM
            ? note
            : `${note} Its start and end:\n${whole(text.slice(0, HEAD))}\n[…]\n${whole(text.slice(-TAIL))}`,
      },
    ],
  };
}

// A cut can split an emoji's surrogate pair, and providers reject the half.
const whole = (text: string) =>
  text.replace(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/g, '');

function pruneCalls(
  message: AssistantMessage,
  old: ReadonlySet<string>,
): AssistantMessage {
  let changed = false;
  const content = message.content.map((block) => {
    if (block.type !== 'toolCall' || !old.has(block.id)) return block;
    const args = slim(block.arguments);
    if (!args) return block;
    changed = true;
    return { ...block, arguments: args };
  });
  return changed ? { ...message, content } : message;
}

/** Undefined when nothing is long enough to shrink. */
function slim(args: ToolCall['arguments']) {
  let changed = false;
  const out: ToolCall['arguments'] = {};
  for (const [key, value] of Object.entries(args)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (key === 'summary' || text.length <= KEEP_ARG) {
      out[key] = value;
      continue;
    }
    changed = true;
    if (key === 'code') {
      // A codemode script: the summaries of the calls it made say enough.
      const calls = [
        ...text.matchAll(/summary\s*:\s*(["'`])((?:(?!\1)[^\n]){1,120})\1/g),
      ].map((m) => m[2]);
      out[key] = calls.length
        ? `[Script cleared. Its calls: ${calls.join('; ')}]`
        : '[Script cleared]';
    } else if (typeof value === 'string') {
      const first = value.trim().split('\n')[0]!.slice(0, 80);
      out[key] = `${first}… [cleared]`;
    } else out[key] = '[cleared]';
  }
  return changed ? out : undefined;
}
