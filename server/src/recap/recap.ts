import type { Recap } from '@bica/shared/protocol';
import { completeFast, fastModelId } from '../models/fast-model';
import { readSession, type Step } from './activity';

// The Recap tab (docs/recap.md). The agent keeps no plan: the fast model
// guesses one from the prompts, the replies, and the summary every tool call
// carries, never from tool inputs or outputs.

const SYSTEM = `You watch a coding agent's session for its user, who glances at a side panel to see where the session stands. You get the session as a timeline (<session>): the user's prompts, the agent's replies, and one line per tool call with the agent's own short summary of what the call was for. Tool inputs and outputs are left out. The agent keeps no plan of its own, so you read its intent from these lines.

Reply with one JSON object and nothing else:
{"goal": "...", "now": "...", "done": ["..."], "next": ["..."]}

- goal: what the user wants from this session overall, in one sentence of at most 14 words. When later prompts changed the direction, describe where it's heading now.
- now: when the status is running, what the agent is doing at this moment, from its latest calls ("Running the tests after the fix"). Otherwise where it stopped and what it waits for from the user ("Done, waiting for your review", "Asked which API to use"). At most 14 words.
- done: what the session achieved, oldest first, at most 4 items of at most 8 words each. Outcomes ("Recap tab lists changed files"), not actions ("Read SidePanel.tsx"). Merge small steps. Leave out failed attempts unless the failure is the outcome.
- next: what is most likely still to come, at most 3 items of at most 8 words each, taken from what the agent said it would do, what the user asked that isn't done, or a check that hasn't run. Empty when the work looks finished.

Write plain, specific words a developer would use. No markdown inside the strings.`;

// Enough for a long session's gist; the newest part wins when it's longer.
const MAX_CHARS = 40_000;
const PROMPT_CHARS = 1_500;
const FIRST_PROMPT_CHARS = 4_000;
const REPLY_CHARS = 700;

function timeline(steps: Step[]) {
  const lines = steps.map((s, i) => {
    if (s.kind === 'call')
      return `  · ${s.call.name}${s.call.failed ? ' (failed)' : ''}: ${s.call.summary || '(no summary)'}`;
    const max =
      s.kind === 'reply'
        ? REPLY_CHARS
        : i === 0
          ? FIRST_PROMPT_CHARS
          : PROMPT_CHARS;
    const text = s.text.replace(/\s+/g, ' ');
    return `[${s.kind === 'prompt' ? 'user' : 'agent'}] ${text.length > max ? `${text.slice(0, max)}…` : text}`;
  });
  let total = 0;
  let from = lines.length;
  while (from > 1 && total + lines[from - 1]!.length < MAX_CHARS)
    total += lines[--from]!.length + 1;
  // The first prompt stays: it usually holds the goal.
  return from > 1
    ? [lines[0], `[… ${from - 1} earlier lines left out]`, ...lines.slice(from)]
    : lines;
}

const cache = new Map<string, Promise<Recap>>();
const MAX_CACHED = 40;

/**
 * Where a session stands, as the fast model reads it; null without one.
 * The same transcript and status reuse the last answer unless `fresh`.
 */
export async function sessionRecap(
  id: string,
  fresh = false,
): Promise<Recap | null> {
  if (!fastModelId()) return null;
  const { steps, title, status } = await readSession(id);
  if (!steps.length) throw new Error('Nothing has happened yet');
  const key = `${id}:${steps.length}:${status}`;
  let answer = fresh ? undefined : cache.get(key);
  if (!answer) {
    answer = guess(title, status, steps);
    cache.set(key, answer);
    answer.catch(() => cache.delete(key));
    while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  }
  return answer;
}

async function guess(
  title: string,
  status: string,
  steps: Step[],
): Promise<Recap> {
  const started = Date.now();
  const prompt = `<session title="${title.replace(/"/g, "'")}" status="${status}">\n${timeline(steps).join('\n')}\n</session>`;
  const reply = await completeFast(SYSTEM, prompt, {
    maxTokens: 500,
    timeoutMs: 45_000,
  });
  const parsed = parse(reply.text);
  return {
    ...parsed,
    at: Date.now(),
    model: reply.model,
    tokens: reply.usage.totalTokens,
    cost: reply.usage.cost.total,
    ms: Date.now() - started,
  };
}

function parse(text: string) {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) throw new Error('The fast model wrote no recap; try again');
  const value = JSON.parse(json) as Record<string, unknown>;
  const line = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const list = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : []).map(line).filter(Boolean).slice(0, max);
  return {
    goal: line(value.goal),
    now: line(value.now),
    done: list(value.done, 4),
    next: list(value.next, 3),
  };
}
