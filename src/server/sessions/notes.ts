import 'server-only';
import type { ConversationId } from '@earendil-works/pi-durable';

import { context, getHarness } from '#server/agent';
import { serverProfile } from '#server/profiles';
import type { PromptImage } from '#lib/protocol';
import { queued, submit, type QueuedInput } from './prompts';
import { prompters, readSession, recentMessages } from './read';
import { SessionDoc, getConversation, listSessions, load } from './store';

// When a run ends, its starter (`startedBy`) hears of it, and so do the
// sessions in its `watchers`, for that run only. The last run state seen of
// every session tells when a run ends.
export const runState = new Map<ConversationId, boolean>();

function addTo(
  id: ConversationId,
  field: 'watchers' | 'messaged',
  who: string,
) {
  return getHarness().then((harness) =>
    harness.commit(async (tx) => {
      const doc = await tx.doc(SessionDoc, id);
      if (!doc[field]?.includes(who)) doc[field] = [...(doc[field] ?? []), who];
    }, context),
  );
}

/** Session `from` messaged `to` during its current run. */
export const noteMessage = (from: ConversationId, to: string) =>
  addTo(from, 'messaged', to);

/**
 * `watcher` hears when the current or next run of this session ends. The
 * session's starter hears of every run anyway, from `startedBy`.
 */
export async function notifyWhenIdle(id: string, watcher: ConversationId) {
  await load();
  await addTo(Number(id) as ConversationId, 'watchers', String(watcher));
}

export function runChanged(id: ConversationId | undefined, running: boolean) {
  if (id === undefined) return;
  const was = runState.get(id);
  runState.set(id, running);
  if (running || !was) return;
  void runEnded(id).catch((error) => console.error('[note]', error));
}

/**
 * Notes for the end of a run: to its starter and one-off watchers, and when
 * it asks or fails, to every hub too (docs/hub.md). A watcher it already
 * messaged this run hears only of a question or an error.
 */
async function runEnded(id: ConversationId) {
  // Taken and cleared at once: these were for the run that just ended.
  let once: string[] = [];
  let told: string[] = [];
  let quiet: boolean | undefined;
  await (
    await getHarness()
  ).commit(async (tx) => {
    const doc = await tx.doc(SessionDoc, id);
    once = doc.watchers ?? [];
    told = doc.messaged ?? [];
    quiet = doc.quiet;
    if (doc.watchers) delete doc.watchers;
    if (doc.messaged) delete doc.messaged;
  }, context);
  const s = await readSession(String(id)).catch(() => undefined);
  // Archived: done with, so it doesn't report.
  if (!s || s.archivedAt) return;
  const watchers = new Set(once);
  // A parent backs off from a session the user took over.
  if (s.parentDrives && !quiet) watchers.add(s.startedBy!);
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
    const { asks } = await recentMessages(String(id), 1);
    what = `is waiting for the user's answer to:\n${asks || s.reply}`;
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

/**
 * A prompt the user typed. When it takes the session over, its parent hears
 * that it should back off; with `keep`, a parent that still drives gets a
 * copy, so it knows what he said.
 */
export async function fromUser(
  id: string,
  prompt: string,
  images: PromptImage[],
  requestId: string,
  whenBusy: 'followUp' | 'steer' | undefined,
  keep: boolean,
) {
  const parent = await submit(
    id,
    prompt,
    images,
    requestId,
    'user',
    whenBusy,
    keep,
  );
  const s = await readSession(id);
  if (parent)
    await tell(
      parent,
      `The user took over session ${id} "${s.title}", which you started. He drives it now, so leave it to him: don't message, steer, or stop it unless he asks you to. You hear no more of its turns unless he hands it back.`,
    );
  else if (keep && s.parentDrives && prompt)
    await tell(
      s.startedBy!,
      `The user wrote to session ${id} "${s.title}", which you started, and left it in your charge. His words:\n\n${prompt}`,
    );
}

/** The user gives a session he took over back to the session that started it. */
export async function handBack(id: string) {
  const conversation = await getConversation(id);
  let parent: string | undefined;
  await (
    await getHarness()
  ).commit(async (tx) => {
    const doc = await tx.doc(SessionDoc, conversation.id);
    if (!doc.startedBy || !doc.userPrompted) return;
    parent = doc.startedBy;
    doc.userPrompted = false;
    doc.handoffs = [...(doc.handoffs ?? []), { at: Date.now(), to: 'parent' }];
  }, context);
  if (!parent) return;
  const s = await readSession(id);
  await tell(
    parent,
    `The user handed session ${id} "${s.title}" back to you. You drive it again and hear of its turns. Its last reply:\n\n${s.reply || '(none)'}`,
  );
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
