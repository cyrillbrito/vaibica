import type { ConversationId } from '@earendil-works/pi-durable';

import type { AgentId } from '@bica/shared/agents';
import type { PullRequest, VoiceSettings } from '@bica/shared/protocol';
import { context, getHarness } from '#server/agent';
import { getAgent, selection } from '#server/agents';
import { getProject, removeGitWorktree, worktreeRisk } from '#server/projects';
import { allTerminals, removeTerminal, terminalsIn } from '#server/terminals';
import {
  SessionDoc,
  getConversation,
  listSessions,
  newestEntry,
  sessions,
} from './store';

/**
 * Switches the agent a session runs as: its tools now, its instructions with
 * the next prompt. Both are part of the prompt cache, so it is rebuilt once.
 */
export async function setAgent(id: string, agent: AgentId) {
  const conversation = await getConversation(id);
  await (
    await getHarness()
  ).commit(async (tx) => {
    (await tx.doc(SessionDoc, conversation.id)).profile = agent;
  }, context);
  await conversation.configure(
    { extensions: selection(getAgent(agent)) },
    context,
  );
  await sessions.refresh();
}

/** How the session's next voice calls sound. */
export async function setVoice(id: string, voice: VoiceSettings) {
  const { id: conversationId } = await getConversation(id);
  await (
    await getHarness()
  ).commit(async (tx) => {
    (await tx.doc(SessionDoc, conversationId)).voice = {
      speed: Math.min(1.5, Math.max(0.25, voice.speed)),
      instructions: voice.instructions.trim().slice(0, 4000),
    };
  }, context);
  await sessions.refresh();
}

/** A name chosen by hand; it replaces the generated one for good. */
export async function rename(id: string, title: string) {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!clean) throw new Error('A title cannot be empty');
  const { id: conversationId } = await getConversation(id);
  await (
    await getHarness()
  ).commit(async (tx) => {
    (await tx.doc(SessionDoc, conversationId)).title = clean;
  }, context);
  // The list goes out before the reply, so the new name never flickers back.
  // (Commit listeners run before commit() resolves: the id is already stale.)
  await sessions.refresh();
}

/** Marks everything in the session so far as read, or the newest reply unread. */
export async function markSeen(id: string, seen = true) {
  const conversationId = Number(id) as ConversationId;
  if (!Number.isInteger(conversationId)) throw new Error(`No session ${id}`);
  const newest = await newestEntry(conversationId);
  if (!newest) return;
  await (
    await getHarness()
  ).commit(async (tx) => {
    const doc = await tx.doc(SessionDoc, conversationId);
    if (!seen) doc.seenEntry = newest.id - 1;
    else if ((doc.seenEntry ?? 0) < newest.id) doc.seenEntry = newest.id;
  }, context);
}

/**
 * Removes a worktree: its sessions archived, terminals closed, folder and
 * local branch gone. Without force, returns what would be lost instead.
 */
export async function removeWorktree(
  projectId: string,
  cwd: string,
  force: boolean,
) {
  const project = await getProject(projectId);
  const w = project.workspaces.find((w) => w.path === cwd && !w.main);
  if (!w) throw new Error(`${cwd} is not a worktree of ${project.name}`);
  if (!force) {
    const risk = await worktreeRisk(cwd, w.pr);
    if (risk) return risk;
  }
  await retireSessions(cwd, w.branch, w.pr);
  for (const t of terminalsIn(cwd)) await removeTerminal(t.id);
  await removeGitWorktree(projectId, cwd);
  return null;
}

/**
 * Before a worktree goes: archives its sessions and notes the branch and PR
 * on each, so the archived list still says what they were for.
 */
export async function retireSessions(
  cwd: string,
  branch: string | null,
  pr: PullRequest | null,
) {
  const here = (await listSessions()).filter((s) => s.cwd === cwd);
  if (here.some((s) => s.status === 'running' || s.status === 'retrying'))
    throw new Error('A session there is still running');
  await (
    await getHarness()
  ).commit(async (tx) => {
    for (const s of here) {
      const doc = await tx.doc(SessionDoc, Number(s.id) as ConversationId);
      doc.archivedAt ||= Date.now();
      doc.cleanedUp = { branch, pr };
    }
  }, context);
}

/** Hides a session from the list, or brings it back. Nothing is deleted. */
export async function archive(id: string, archived: boolean) {
  const { id: conversationId } = await getConversation(id);
  await (
    await getHarness()
  ).commit(async (tx) => {
    const doc = await tx.doc(SessionDoc, conversationId);
    // 0, not delete: docs hold plain JSON values.
    doc.archivedAt = archived ? doc.archivedAt || Date.now() : 0;
  }, context);
  // Its dev servers and shells go with it.
  if (archived)
    for (const t of allTerminals())
      if (t.startedBy === id) await removeTerminal(t.id);
}
