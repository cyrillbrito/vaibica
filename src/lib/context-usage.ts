// What fills a session's context window, what it cost, and whether the prompt
// cache is warm; all derived from the conversation view (docs/context-usage.md).
//
// Like Pi's context extensions: count each part at four characters a token,
// then scale all parts to the size the provider measured.
import type {
  AssistantMessage,
  Message,
  ToolCall,
  Usage,
} from '@earendil-works/pi-ai';
import type {
  ConversationView,
  EntryRecord,
  LiveState,
  UsageState,
} from '@earendil-works/pi-durable';

import { IMAGE_CHARS, chars, cleanupEdits } from './cleanup';
import type { ModelCatalog } from './protocol';

export type Group = 'system' | 'tools' | 'conversation';

export interface Part {
  key: string;
  label: string;
  group: Group;
  tokens: number;
  /** A second line, e.g. which skills are loaded. */
  detail?: string;
}

/** One large piece of the conversation; `target` finds its transcript row. */
export interface Item {
  label: string;
  detail: string;
  tokens: number;
  target: { call: string } | { key: string };
}

export interface Spend {
  model: string;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  cost: number;
}

export interface ContextUsage {
  /** Tokens in the window: the last request, plus estimates of what came after. */
  used: number;
  /** False: no answer since the start or the last compaction; all estimated. */
  measured: boolean;
  /** Absent: the model isn't in the catalog. */
  window?: number;
  compactAt?: number;
  backgroundAt?: number;
  /** Largest first within each group; they add up to `used`. */
  parts: Part[];
  biggest: Item[];
  /**
   * Answers after the first that rewrote most of their context: the cache had
   * expired or the prefix changed.
   */
  misses: number;
  spend: Spend[];
  /** When the last request went out and how long its cache lives (ms). */
  cache?: { at: number; ttl: number };
  compacting: boolean;
  running: boolean;
  /** Tokens a clean up would take off now (src/lib/cleanup.ts). */
  cleanable: number;
}

// pi-ai's estimate: four characters a token, an image as IMAGE_CHARS.
const CHARS_PER_TOKEN = 4;
const tokensOf = (chars: number) => chars / CHARS_PER_TOKEN;

/** The size of a request, as pi-ai counts it. */
export const requestTokens = (u: Usage) =>
  u.totalTokens || u.input + u.cacheRead + u.cacheWrite + u.output;

const answered = (m: AssistantMessage) =>
  m.stopReason !== 'error' &&
  m.stopReason !== 'aborted' &&
  requestTokens(m.usage) > 0;

export function contextUsage(
  view: ConversationView,
  catalog: ModelCatalog | undefined,
): ContextUsage {
  const parts = new Map<string, Part>();
  const add = (key: string, label: string, group: Group, chars: number) => {
    if (chars <= 0) return;
    const part = parts.get(key);
    if (part) part.tokens += tokensOf(chars);
    else parts.set(key, { key, label, group, tokens: tokensOf(chars) });
  };
  const items: Item[] = [];
  const calls = new Map<string, ToolCall>();

  // Entries from the head marker on are the model context. Answers before the
  // marker (kept entries) measured a context that no longer exists.
  const marker = view.entries[0]?.head !== undefined ? view.entries[0].id : -1;
  // Per message, its estimate; the newest measured answer replaces the
  // estimates of everything up to and including it.
  const estimates: number[] = [];
  let measured: { at: number; tokens: number } | undefined;
  let answers = 0;
  let misses = 0;
  let lastRequest: AssistantMessage | undefined;
  let lastWrite: Usage | undefined;

  // Context edits (clean ups) replace what earlier entries contribute. Each
  // edit's saving is kept by where it landed: one after the newest answer
  // shrinks a context that answer already measured.
  const byId = new Map(view.entries.map((e) => [e.id, e]));
  const edited = new Map<number, readonly Message[]>();
  const savings: { at: number; chars: number }[] = [];
  const size = (messages: readonly Message[] | undefined) =>
    (messages ?? []).reduce((n, m) => n + chars(m), 0);
  for (const entry of view.entries)
    for (const edit of entry.edits ?? []) {
      const before = edited.get(edit.target) ?? byId.get(edit.target)?.model;
      const after = edit.action === 'replace' ? edit.messages : [];
      savings.push({ at: entry.id, chars: size(before) - size(after) });
      edited.set(edit.target, after);
    }
  const modelOf = (entry: EntryRecord) => edited.get(entry.id) ?? entry.model;
  let measuredEntry = -1;

  for (const entry of view.entries) {
    modelOf(entry)?.forEach((message, mi) => {
      const before = sum(parts);
      const key = `${entry.id}:${mi}`;
      count(message, entry.kind, key);
      estimates.push(sum(parts) - before);
      if (message.role !== 'assistant') return;
      // A request that failed before the provider counted tokens never
      // touched the cache, so it doesn't restart the countdown.
      if (requestTokens(message.usage) > 0) lastRequest = message;
      if (message.usage.cacheWrite > 0) lastWrite = message.usage;
      if (!answered(message) || entry.id <= marker) return;
      const { input, cacheRead, cacheWrite } = message.usage;
      if (answers++ > 0 && cacheWrite + input > cacheRead) misses++;
      measured = {
        at: estimates.length,
        tokens: requestTokens(message.usage),
      };
      measuredEntry = entry.id;
    });
  }

  function count(message: Message, kind: string, key: string) {
    if (message.role === 'system') {
      add('system', 'Base prompt', 'system', textLength(message.content));
      for (const [name, text] of Object.entries(message.sections ?? {})) {
        if (text) section(name, text);
      }
      for (const tool of message.toolsAdded ?? [])
        add(
          `tool:${tool.name}`,
          tool.name,
          'tools',
          JSON.stringify(tool).length,
        );
      return;
    }
    if (message.role === 'user') {
      const summary = kind === 'pi.compaction';
      const content = message.content;
      const text =
        typeof content === 'string' ? content.length : textLength(content);
      const images =
        typeof content === 'string'
          ? 0
          : content.filter((b) => b.type === 'image').length;
      add(
        summary ? 'summary' : 'prompts',
        summary ? 'Compaction summary' : 'Prompts',
        'conversation',
        text,
      );
      add('images', 'Images', 'conversation', images * IMAGE_CHARS);
      if (!summary)
        items.push({
          label: images ? 'Prompt with images' : 'Prompt',
          detail: firstLine(typeof content === 'string' ? content : ''),
          tokens: tokensOf(text + images * IMAGE_CHARS),
          target: { key },
        });
      return;
    }
    if (message.role === 'assistant') {
      message.content.forEach((block, bi) => {
        if (block.type === 'text') {
          add('replies', 'Replies', 'conversation', block.text.length);
          items.push({
            label: 'Reply',
            detail: firstLine(block.text),
            tokens: tokensOf(block.text.length),
            target: { key: `${key}:${bi}` },
          });
        } else if (block.type === 'thinking')
          add('thinking', 'Thinking', 'conversation', block.thinking.length);
        else if (block.type === 'toolCall') {
          calls.set(block.id, block);
          add(
            'calls',
            'Tool calls',
            'conversation',
            block.name.length + JSON.stringify(block.arguments).length,
          );
        }
      });
      return;
    }
    if (message.role === 'toolResult') {
      const chars = message.content.reduce(
        (n, b) => n + (b.type === 'text' ? b.text.length : IMAGE_CHARS),
        0,
      );
      add(
        `result:${message.toolName}`,
        `${message.toolName} results`,
        'conversation',
        chars,
      );
      const args = calls.get(message.toolCallId)?.arguments ?? {};
      items.push({
        label: message.toolName,
        detail: describe(args),
        tokens: tokensOf(chars),
        target: { call: message.toolCallId },
      });
    }
  }

  // AGENTS.md, memory, and skills get their own lines, the skills by name
  // so it's easy to see which loaded; the rest of the prompt is one line.
  // Section keys are those in src/server/profiles/common.ts.
  function section(name: string, text: string) {
    const file = /path="[^"]*?([^/"]+)"/.exec(text)?.[1];
    if (name === 'project_context')
      add('project', file ?? 'Project file', 'system', text.length);
    else if (name === 'memory')
      add('memory', file ?? 'Memory', 'system', text.length);
    else if (name === 'skills') {
      const names = [...text.matchAll(/<name>([^<]*)<\/name>/g)].map(
        (m) => m[1],
      );
      add('skills', `Skills (${names.length})`, 'system', text.length);
      parts.get('skills')!.detail = names.join(', ');
    } else add('instructions', 'Instructions', 'system', text.length);
  }

  // Scale every part so they add up to the measured size, plus the estimates
  // of what came after it. The scale also covers what we can't see: the
  // provider's own preamble, message framing, and the real tokenizer.
  const estimated = sum(parts);
  let used = estimated;
  const stale = tokensOf(
    savings.reduce((n, s) => (s.at > measuredEntry ? n + s.chars : n), 0),
  );
  if (measured) {
    const upTo = estimates.slice(0, measured.at).reduce((a, b) => a + b, 0);
    const after = estimated - upTo;
    // The answer measured the context before the newer edits; shrink it by
    // their share of what it counted.
    used = measured.tokens * (upTo / (upTo + stale || 1)) + after;
  }
  const scale = estimated > 0 ? used / estimated : 1;
  for (const part of parts.values()) part.tokens *= scale;
  for (const item of items) item.tokens *= scale;
  const cleanable =
    tokensOf(
      cleanupEdits(view.entries, modelOf).reduce(
        (n, e) =>
          n +
          size(modelOf(byId.get(e.target)!)) -
          size(e.action === 'replace' ? e.messages : []),
        0,
      ),
    ) * scale;

  const model = view.docs['pi.agent'] as
    | { model?: { provider: string; modelId: string } }
    | undefined;
  const info = catalog?.models.find(
    (m) =>
      m.provider === model?.model?.provider && m.id === model?.model?.modelId,
  );
  const window = info?.contextWindow;
  const compactAt =
    window && catalog ? window - catalog.compaction.reserveTokens : undefined;

  // The long tier only when the provider reported writing to it.
  const ttl = lastWrite?.cacheWrite1h
    ? info?.cacheTtl.long
    : info?.cacheTtl.short;
  const live = view.docs['pi.live'] as LiveState | undefined;

  return {
    used,
    measured: !!measured && stale === 0,
    window,
    compactAt,
    backgroundAt:
      compactAt && catalog
        ? compactAt - catalog.compaction.backgroundTokens
        : undefined,
    parts: [...parts.values()].sort(
      (a, b) =>
        GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) ||
        b.tokens - a.tokens,
    ),
    biggest: items.sort((a, b) => b.tokens - a.tokens).slice(0, 6),
    misses,
    spend: spendOf(view.docs['pi.usage'] as UsageState | undefined),
    cache:
      lastRequest && lastWrite && ttl
        ? { at: lastRequest.timestamp, ttl: ttl * 1000 }
        : undefined,
    compacting: !!live?.compactions?.length,
    running: !!live?.run,
    cleanable,
  };
}

export const GROUPS: Group[] = ['system', 'tools', 'conversation'];

// Below this a clean up isn't worth offering.
export const MIN_CLEANUP = 1000;

// Past 200k a session gets slow, pricey and forgetful, whatever the window.
export const BLOATED = 200_000;

/** 0 below 200k, then one step per 100k, up to 4 at 500k. */
export const bloat = (used: number) =>
  used < BLOATED ? 0 : Math.min(4, Math.floor(used / 100_000) - 1);

function spendOf(usage: UsageState | undefined): Spend[] {
  return Object.entries(usage?.models ?? {})
    .map(([model, u]) => ({
      model,
      input: u.input,
      cacheRead: u.cacheRead,
      cacheWrite: u.cacheWrite,
      output: u.output,
      cost: u.cost.total,
    }))
    .sort((a, b) => b.cost - a.cost);
}

const sum = (parts: Map<string, Part>) => {
  let n = 0;
  for (const p of parts.values()) n += p.tokens;
  return n;
};

const textLength = (
  content: string | readonly { type: string; text?: string }[],
) =>
  typeof content === 'string'
    ? content.length
    : content.reduce((n, b) => n + (b.text?.length ?? 0), 0);

const firstLine = (text: string) => text.trim().split('\n')[0]!.slice(0, 120);

// The coding tools' summary, or the argument that names the target.
function describe(args: Record<string, unknown>) {
  for (const key of ['summary', 'path', 'command', 'url', 'query']) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return firstLine(value);
  }
  return '';
}

/** 950, 12.3k, 126k, 1.2M */
export function formatTokens(n: number) {
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function formatCost(dollars: number) {
  return dollars < 0.01 && dollars > 0 ? '<$0.01' : `$${dollars.toFixed(2)}`;
}
