// Clean up: clears old tool output from the model context, without a model
// call (docs/context-usage.md). Shared by the server, which writes the edits,
// and the browser, which shows what they would save.
import type {
  AssistantMessage,
  Message,
  ToolCall,
  ToolResultMessage,
} from '@earendil-works/pi-ai';
import type { ContextEdit, EntryRecord } from '@earendil-works/pi-durable';

export const CLEANUP_HINT =
  'Clears old tool output and images from what the model reads, so the next message sends less. Your messages, the replies and the reasoning stay, and the transcript keeps everything.';

/** The entry that carries the edits; it adds nothing to the context itself. */
export const CLEANUP_ENTRY = 'tau.cleanup';

// pi-ai's estimate, as in context-usage.ts.
export const IMAGE_CHARS = 4800;

// Outputs and arguments this short stay as they are: they cost little and
// often carry the point ("Edited 2 files", a path, a short command).
const KEEP_OUTPUT = 300;
const KEEP_ARG = 120;

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

/**
 * Edits that clean up every turn before the last prompt: tool output and
 * images give way to a note, and long tool arguments shrink to their summary
 * and first line. Prompts, thinking and replies stay. `current` is what each
 * entry adds to the context now, after earlier edits.
 */
export function cleanupEdits(
  entries: readonly EntryRecord[],
  current: (entry: EntryRecord) => readonly Message[] | undefined,
): ContextEdit[] {
  const last = entries.findLastIndex((e) => e.kind === 'pi.user');
  const edits: ContextEdit[] = [];
  for (const entry of entries.slice(0, Math.max(0, last))) {
    const messages = current(entry);
    if (!messages) continue;
    const cleaned = messages.map(clean);
    if (cleaned.some((m, i) => m !== messages[i]))
      edits.push({ target: entry.id, action: 'replace', messages: cleaned });
  }
  return edits;
}

function clean(message: Message): Message {
  if (message.role === 'toolResult') return cleanResult(message);
  if (message.role === 'assistant') return cleanCalls(message);
  return message;
}

function cleanResult(message: ToolResultMessage): ToolResultMessage {
  const size = chars(message);
  const image = message.content.some((b) => b.type === 'image');
  if (size <= KEEP_OUTPUT && !image) return message;
  const { details: _details, nestedCalls: _nested, ...rest } = message;
  return {
    ...rest,
    content: [
      {
        type: 'text',
        text: `[Old output cleared to save context, ~${Math.round(size / 4)} tokens. Run the tool again if you need it.]`,
      },
    ],
  };
}

function cleanCalls(message: AssistantMessage): AssistantMessage {
  let changed = false;
  const content = message.content.map((block) => {
    if (block.type !== 'toolCall') return block;
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
