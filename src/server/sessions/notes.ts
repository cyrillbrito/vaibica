import 'server-only';
import type { ConversationId } from '@earendil-works/pi-durable';

import { context, getHarness } from '#server/agent';
import { serverProfile } from '#server/profiles';
import { queued, submit, type QueuedInput } from './prompts';
import { prompters, readSession, recentMessages } from './read';
import { SessionDoc, getConversation, listSessions, load } from './store';

// When a run ends, its starter (`startedBy`) hears of it, and so do these:
// sessions that messaged it with `notify`, for that run only. The last run
// state seen of every session tells when a run ends.
export const runState = new Map<ConversationId, boolean>();
const onceWatchers = new Map<ConversationId, Set<string>>();
// Who each running session messaged this run: a watcher it already
// messaged needs no note that repeats it.
const messaged = new Map<ConversationId, Set<string>>();

/** Session `from` messaged `to` during its current run. */
export function noteMessage(from: ConversationId, to: string) {
  let set = messaged.get(from);
  if (!set) messaged.set(from, (set = new Set()));
  set.add(to);
}

export function runChanged(id: ConversationId | undefined, running: boolean) {
  if (id === undefined) return;
  const was = runState.get(id);
  runState.set(id, running);
  if (running) return;
  const told = messaged.get(id) ?? new Set<string>();
  messaged.delete(id);
  if (!was) return;
  const once = onceWatchers.get(id) ?? new Set<string>();
  onceWatchers.delete(id);
  void runEnded(id, once, told).catch((error) =>
    console.error('[note]', error),
  );
}

/**
 * `watcher` hears when the current or next run of this session ends. The
 * session's starter hears of every run anyway, from `startedBy`.
 */
export async function notifyWhenIdle(id: string, watcher: ConversationId) {
  await load();
  const conversationId = Number(id) as ConversationId;
  let set = onceWatchers.get(conversationId);
  if (!set) onceWatchers.set(conversationId, (set = new Set()));
  set.add(String(watcher));
}

/**
 * Notes for the end of a run: to its starter and one-off watchers, and when
 * it asks or fails, to every hub too (docs/hub.md). A watcher it already
 * messaged this run hears only of a question or an error.
 */
async function runEnded(
  id: ConversationId,
  once: Set<string>,
  told: Set<string>,
) {
  const s = await readSession(String(id)).catch(() => undefined);
  // Archived: done with, so it doesn't report.
  if (!s || s.archivedAt) return;
  const meta = await (await getHarness()).snapshot(SessionDoc, id, context);
  const watchers = new Set(once);
  if (s.startedBy && !meta?.quiet) watchers.add(s.startedBy);
  const alert = s.status === 'error' || s.status === 'waiting';
  if (alert)
    for (const other of await listSessions())
      if (serverProfile(other.profile).hearsAlerts && !other.archivedAt)
        watchers.add(other.id);
  watchers.delete(String(id));
  if (!alert) for (const w of told) watchers.delete(w);
  if (!watchers.size) return;
  let what = `finished its turn. Its last reply:\n\n${s.reply || '(none)'}`;
  if (s.status === 'error')
    what = `stopped with an error. Its last reply:\n\n${s.reply || '(none)'}`;
  if (s.status === 'waiting') {
    const { questions } = await recentMessages(String(id), 1);
    what = `is waiting for the user's answer to:\n${questions.map((q) => `- ${q.question} (${q.options.map((o) => o.label).join(' / ')})`).join('\n') || s.reply}`;
  }
  // The hub leaves sessions the user prompts to him (docs/hub.md), so it must know them.
  const { user } = await prompters(String(id));
  for (const w of watchers) {
    const whose = user
      ? w === s.startedBy
        ? ', which you started and the user now prompts himself,'
        : ', which the user prompts himself,'
      : w === s.startedBy
        ? ', which you started,'
        : '';
    await tell(w, `Session ${id} "${s.title}"${whose} ${what}`);
  }
}

const NOTE = '[Note from Bica, not from the user]';
// Notes' request ids start with it, so a queued note can be found and merged.
const NOTE_REQUEST = 'note:';

/**
 * A note from Bica to a session about work it watches, queued like a
 * follow-up: it waits for a running turn and wakes an idle one. Notes that
 * pile up while it works merge into one, so ten finished sessions cost one
 * turn, not ten. An archived or deleted session gets nothing.
 */
export async function tell(id: string, text: string) {
  try {
    const conversation = await getConversation(id);
    const meta = await (
      await getHarness()
    ).snapshot(SessionDoc, conversation.id, context);
    if (!meta || meta.archivedAt) return;
    let note = `${NOTE} ${text}`;
    const harness = await getHarness();
    let waiting: QueuedInput | undefined;
    for (const item of (await queued(conversation.id)).toReversed()) {
      const submission = await harness.submission(item.id, context);
      const record = await submission?.status(context);
      if (record?.requestId?.startsWith(NOTE_REQUEST)) {
        waiting = item;
        break;
      }
    }
    // Not aborted: it was just sent, so this note goes on its own.
    if (
      waiting &&
      (await harness.abortSubmission(waiting.id, context, conversation.id)) ===
        'aborted'
    )
      note = `${waiting.content as string}\n\n---\n\n${note}`;
    await submit(
      id,
      note,
      [],
      `${NOTE_REQUEST}${Date.now()}:${Math.random()}`,
      'bica',
    );
  } catch (error) {
    console.error('[note]', error);
  }
}
