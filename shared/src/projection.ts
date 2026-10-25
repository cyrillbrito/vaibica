// What the browser gets of a conversation: the transcript without what only
// an opened row shows. Tool inputs and outputs, thinking and the system
// prompt stay here, and `stepDetail` sends one when its row opens. Like Pi
// Pocket's projection (https://github.com/TannerMidd/pi-pocket).
import type { Message } from '@earendil-works/pi-ai';
import type {
  ConversationView,
  EntryRecord,
  LiveState,
} from '@earendil-works/pi-durable';

import { contextBreakdown } from './context-breakdown';
import { contextOf, contextUsage } from './context-usage';
import type { ModelCatalog, StepDetail } from './protocol';

type Json = Record<string, unknown>;

// Long enough for a summary, a path or a command's first line.
const ARG_CHARS = 200;
// Shown whole: its questions are the card.
const ASK = 'ask';

/** Projects views one after another; entries never change, so each is projected once. */
export function projector(catalog: () => ModelCatalog | undefined) {
  const entries = new WeakMap<EntryRecord, EntryRecord>();
  const entry = (e: EntryRecord) => {
    let slim = entries.get(e);
    if (!slim) entries.set(e, (slim = slimEntry(e)));
    return slim;
  };
  // Context usage reads everything, so it's worked out here; only when the
  // entries or the run change, not on every streamed word.
  let usageKey: unknown[] = [];
  let usage: unknown;
  return (view: ConversationView): ConversationView => {
    const live = view.docs['pi.live'] as LiveState | undefined;
    const key = [
      view.entries,
      view.docs['pi.agent'],
      live?.run,
      live?.compactions,
      catalog(),
    ];
    if (key.some((k, i) => k !== usageKey[i])) {
      usageKey = key;
      const status = contextUsage(view, catalog());
      const breakdown = contextBreakdown(contextOf(view), status.used);
      // Rounded to what formatTokens shows, so a new answer, which rescales
      // every part, changes fewer of them.
      for (const p of [...breakdown.parts, ...breakdown.biggest])
        p.tokens = shown(p.tokens);
      // Through JSON to drop the fields it leaves undefined.
      usage = JSON.parse(JSON.stringify({ ...status, ...breakdown }));
    }
    const { instructions: _instructions, ...agent } = (view.docs['pi.agent'] ??
      {}) as Json;
    return {
      ...view,
      entries: view.entries.map(entry),
      docs: defined({
        ...view.docs,
        'pi.agent': agent,
        'pi.live': live && slimLive(live),
        'bica.context': usage,
      }) as ConversationView['docs'],
    };
  };
}

function slimEntry({ edits: _edits, ...e }: EntryRecord): EntryRecord {
  return e.model ? { ...e, model: e.model.map(slimMessage) } : e;
}

function slimLive(live: LiveState): LiveState {
  const message = live.generation?.message as Message | undefined;
  return defined({
    ...live,
    generation:
      live.generation &&
      defined({
        ...live.generation,
        message: message && (slimMessage(message) as never),
      }),
    tools: live.tools?.map(({ output: _output, details, ...slot }) => ({
      ...slot,
      details: timing(details) as never,
    })),
    // Their arguments can hold whole files; an opened row loads them.
    nestedTools: undefined,
  }) as LiveState;
}

function slimMessage(m: Message): Message {
  // Only the context breakdown reads it, and that's worked out here.
  if ((m.role as string) === 'system')
    return { role: 'system', content: '' } as never;
  if (m.role === 'toolResult')
    return {
      ...m,
      content: [],
      details: defined({
        ...timing(m.details),
        stats: statsOf(m.details),
      }) as never,
    };
  if (m.role !== 'assistant') return m;
  return {
    ...m,
    content: m.content.map((b) => {
      if (b.type === 'thinking')
        // Kept so the row shows; its text comes when opened.
        return defined({
          type: 'thinking',
          thinking: '',
          folded: !!b.thinking.trim(),
          durationMs: (b as { durationMs?: number }).durationMs,
        }) as never;
      if (b.type !== 'toolCall') return b;
      const { partialJson, ...call } = b as typeof b & {
        partialJson?: string;
      };
      return call.name === ASK
        ? call
        : defined({
            ...call,
            arguments: slimArgs(call.arguments),
            stats: statsOf(undefined, call),
            // pi-ai drops the buffer once the arguments are complete.
            streaming: partialJson !== undefined || undefined,
          });
    }),
  } as Message;
}

/** Short strings and numbers: what the row shows next to the name. */
function slimArgs(args: Json) {
  const slim: Json = {};
  for (const [k, v] of Object.entries(args ?? {}))
    if (typeof v === 'string')
      slim[k] = v.split('\n', 1)[0]!.slice(0, ARG_CHARS);
    else if (typeof v === 'number' || typeof v === 'boolean') slim[k] = v;
  return slim;
}

function shown(n: number) {
  return n < 1000
    ? Math.round(n)
    : Math.round(n / (n < 10_000 ? 100 : 1000)) * (n < 10_000 ? 100 : 1000);
}

function timing(details: unknown) {
  const d = (details ?? {}) as Json;
  return defined({ startedAt: d.startedAt, durationMs: d.durationMs });
}

// JSON has no `undefined`, and the diff of two projections fails on one.
function defined<T extends Json>(value: T): T {
  for (const key of Object.keys(value))
    if (value[key] === undefined) delete value[key];
  return value;
}

function str(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function lines(text: string) {
  return text ? text.replace(/\n$/, '').split('\n') : [];
}

/**
 * Lines added and removed by a write or edit: from the finished edit's
 * patch, or roughly from the call's blocks while it streams.
 */
function statsOf(
  details: unknown,
  call?: { name: string; arguments: Json },
): { added: number; removed: number } | undefined {
  let added = 0;
  let removed = 0;
  const patch = (details as { patch?: unknown } | undefined)?.patch;
  if (typeof patch === 'string') {
    // Skip the `---`/`+++` header: changed lines only follow the first hunk.
    const body = lines(patch);
    const start = body.findIndex((l) => l.startsWith('@@'));
    for (const line of start < 0 ? [] : body.slice(start)) {
      if (line[0] === '+') added++;
      else if (line[0] === '-') removed++;
    }
  } else if (call?.name === 'write')
    added = lines(str(call.arguments.content)).length;
  else if (call?.name === 'edit') {
    const edits = Array.isArray(call.arguments.edits)
      ? call.arguments.edits
      : [];
    // Drop the lines both sides share at the ends, count the rest.
    for (const e of edits as { oldText?: unknown; newText?: unknown }[]) {
      const a = lines(str(e?.oldText));
      const b = lines(str(e?.newText));
      let start = 0;
      while (start < a.length && start < b.length && a[start] === b[start])
        start++;
      let end = 0;
      while (
        end < a.length - start &&
        end < b.length - start &&
        a[a.length - 1 - end] === b[b.length - 1 - end]
      )
        end++;
      removed += a.length - start - end;
      added += b.length - start - end;
    }
  }
  return added || removed ? { added, removed } : undefined;
}

/**
 * What an opened row shows: a tool call by its id, or a thought by its step
 * key (`entry:message:block`, or `live:block` while it streams).
 */
export function stepDetail(
  view: ConversationView,
  key: string,
): StepDetail | null {
  const live = view.docs['pi.live'] as LiveState | undefined;
  const partial = live?.generation?.message as Message | undefined;
  const thought = /^(?:(\d+):(\d+)|live):(\d+)$/.exec(key);
  if (thought) {
    const message = thought[1]
      ? view.entries.find((e) => e.id === Number(thought[1]))?.model?.[
          Number(thought[2])
        ]
      : partial;
    const block =
      message?.role === 'assistant'
        ? message.content[Number(thought[3])]
        : undefined;
    return block?.type === 'thinking' ? { text: block.thinking } : null;
  }
  let args: Json | undefined;
  let result: Extract<Message, { role: 'toolResult' }> | undefined;
  for (const m of [
    ...view.entries.flatMap((e) => e.model ?? []),
    ...(partial ? [partial] : []),
  ]) {
    if (m.role === 'assistant')
      for (const b of m.content)
        if (b.type === 'toolCall' && b.id === key) args = b.arguments;
    if (m.role === 'toolResult' && m.toolCallId === key) result = m;
  }
  if (!args) return null;
  const slot = live?.tools?.find((s) => s.callId === key);
  return {
    args,
    output: result
      ? result.content
          .flatMap((b) => (b.type === 'text' && b.text ? [b.text] : []))
          .join('\n')
      : slot?.output,
    details: result?.details ?? withNested(slot?.details, live, key),
  };
}

/**
 * A running codemode call lists its script's calls only in `pi.live`; its
 * result's details list them once it ends, in the same shape.
 */
function withNested(
  details: unknown,
  live: LiveState | undefined,
  key: string,
) {
  const nested = live?.nestedTools?.filter((n) => n.parentCallId === key);
  if (!nested?.length) return details;
  return {
    ...(details as Json),
    calls: nested.map((n) =>
      defined({
        name: n.name,
        args: JSON.stringify(n.arguments).slice(0, ARG_CHARS),
        status: !n.summary ? 'running' : n.summary.isError ? 'error' : 'ok',
        durationMs: n.summary?.durationMs,
        error: n.summary?.error,
      }),
    ),
  };
}
