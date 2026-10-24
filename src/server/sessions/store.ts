import 'server-only';
import {
  AgentDoc,
  type CommitChange,
  type ConversationId,
  type Cursor,
  LiveDoc,
} from '@earendil-works/pi-durable';

import type { SessionSummary } from '#lib/protocol';
import { isTurn, statusOf } from '#lib/transcript';
import { context, getHarness } from '#server/agent';
import { live } from '#server/live';
import { runChanged, runState } from './notes';
import { SessionDoc, agentIdOf } from './session-doc';

export { SessionDoc, agentIdOf };

// Summaries by conversation, kept between reads. Every commit marks the
// conversations it touched; a read re-summarizes only those.
const summaries = new Map<ConversationId, SessionSummary>();
// Owned conversations are subagents; they belong under their tool call.
const subagents = new Set<ConversationId>();
const dirty = new Set<ConversationId>();
let loaded: Promise<void> | undefined;

/**
 * Listens to commits for good, then marks every session dirty once.
 * Pi Durable has no watch over all conversations; streaming commits every
 * ~100 ms, hence the throttle.
 */
export function load() {
  return (loaded ??= (async () => {
    const harness = await getHarness();
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    harness.subscribeCommits(({ changes }) => {
      for (const change of changes) {
        const id = touched(change);
        if (id !== undefined) dirty.add(id);
        if (change.type === 'document' && change.record.kind === 'pi.live') {
          runChanged(change.conversationId, !!change.value?.run);
        }
      }
      scheduled ??= setTimeout(() => {
        scheduled = undefined;
        void sessions.refresh();
      }, 250);
    });
    const ids = await allConversations();
    for (const id of ids) dirty.add(id);
    // Runs a restart left unfinished resume; their end must still be heard.
    await Promise.all(
      ids.map(async (id) => {
        const live = await harness.snapshot(LiveDoc, id, context);
        if (live?.run && !runState.has(id)) runState.set(id, true);
      }),
    );
  })().catch((error) => {
    loaded = undefined;
    throw error;
  }));
}

export async function listSessions(): Promise<SessionSummary[]> {
  await load();
  const ids = [...dirty];
  dirty.clear();
  try {
    await Promise.all(
      ids.map(async (id) => {
        const s = await summarize(id);
        if (s) summaries.set(id, s);
        else summaries.delete(id);
      }),
    );
  } catch (error) {
    for (const id of ids) dirty.add(id);
    throw error;
  }
  // Creation order: rows don't jump around while agents work.
  return [...summaries.values()].sort((a, b) => b.createdAt - a.createdAt);
}

async function allConversations() {
  const harness = await getHarness();
  const ids: ConversationId[] = [];
  let cursor: Cursor | undefined;
  do {
    const page = await harness.commit(
      (tx) => tx.scanConversations({}, 500, cursor),
      context,
    );
    for (const c of page.items)
      if (c.owner) subagents.add(c.id);
      else ids.push(c.id);
    cursor = page.next;
  } while (cursor);
  return ids;
}

/** One session's row; undefined for subagents and missing conversations. */
export async function summarize(
  id: ConversationId,
): Promise<SessionSummary | undefined> {
  if (subagents.has(id)) return undefined;
  const harness = await getHarness();
  if (!(await harness.conversation(id, context))) return undefined;
  const [meta, live, agent, newest] = await Promise.all([
    harness.snapshot(SessionDoc, id, context),
    harness.snapshot(LiveDoc, id, context),
    harness.snapshot(AgentDoc, id, context),
    newestTurn(id),
  ]);
  const createdAt = meta?.createdAt ?? 0;
  let status = statusOf(live, newest);
  if (
    status === 'idle' &&
    newest &&
    newest.id > (meta?.seenEntry ?? Infinity) &&
    newest.model?.at(-1)?.role !== 'user'
  )
    status = 'done';
  return {
    id: String(id),
    // Empty while the model is still naming it; the UI shows a quiet ellipsis.
    title: meta?.title ?? '',
    status,
    createdAt,
    updatedAt: Math.max(createdAt, newest?.model?.at(-1)?.timestamp ?? 0),
    runningSince:
      status === 'running' || status === 'retrying'
        ? (newest?.model?.[0]?.timestamp ?? null)
        : null,
    projectId: meta?.projectId ?? null,
    cwd: agent?.cwd ?? null,
    archivedAt: meta?.archivedAt || null,
    forkedFrom: meta?.forkedFrom ?? null,
    forkedAt: meta?.forkedAt ?? null,
    startedBy: meta?.startedBy || null,
    parentDrives: !!meta?.startedBy && !meta.userPrompted,
    handoffs: meta?.handoffs ?? [],
    cleanedUp: meta?.cleanedUp ?? null,
    agent: agentIdOf(meta),
    voice: meta?.voice ?? null,
    tonight: meta?.tonight || null,
  };
}

/** The conversation a commit change belongs to, if any. */
function touched(change: CommitChange) {
  if (change.type === 'document') return change.conversationId;
  if (change.type === 'conversation') {
    if (change.value.owner) subagents.add(change.value.id);
    return change.value.id;
  }
  if (change.type === 'entry') return change.value.conversationId;
  return undefined;
}

export async function newestEntry(id: ConversationId) {
  const conversation = await (await getHarness()).conversation(id, context);
  return (await conversation?.entries({}, 1, undefined, context))?.items[0];
}

/** The newest entry from the agent or a prompt: voice lines don't set the status. */
async function newestTurn(id: ConversationId) {
  const conversation = await (await getHarness()).conversation(id, context);
  const page = await conversation?.entries({}, 50, undefined, context);
  return page?.items.find(isTurn);
}

/** The session list now and whenever it changes. */
export const sessions = live(listSessions);

export const watchSessions = sessions.watch;

/** The project and folder a session works in; throws if it has none. */
export async function sessionWorkspace(id: ConversationId) {
  const harness = await getHarness();
  const [meta, agent] = await Promise.all([
    harness.snapshot(SessionDoc, id, context),
    harness.snapshot(AgentDoc, id, context),
  ]);
  if (!meta?.projectId || !agent?.cwd)
    throw new Error('This session has no project folder');
  return { projectId: meta.projectId, cwd: agent.cwd, agent };
}

export async function getConversation(id: string) {
  const conversation = await (
    await getHarness()
  ).conversation(Number(id) as ConversationId, context);
  if (!conversation) throw new Error(`No session ${id}`);
  return conversation;
}
