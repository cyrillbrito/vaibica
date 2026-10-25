import {
  AgentDoc,
  type ConversationId,
  type EntryId,
} from '@earendil-works/pi-durable';

import type { AgentId } from '@bica/shared/agents';
import type {
  ModelChoice,
  PromptImage,
  ThinkingLevel,
} from '@bica/shared/protocol';
import { context, getHarness } from '#server/agent';
import { agentChoice, atLeast, getAgent, selection } from '#server/agents';
import {
  CHATS_ID,
  createChatFolder,
  createWorktree,
  getProject,
  listProjects,
  setupCommand,
} from '#server/projects';
import { checkChoice, fastModelId } from '#server/providers';
import { commandDone, createTerminal, removeTerminal } from '#server/terminals';
import { VOICE_TITLE, nameSession, promptTitle, retitle } from './names';
import { submit } from './prompts';
import {
  SessionDoc,
  getConversation,
  agentIdOf,
  newestEntry,
  sessions,
} from './store';

export interface NewSession {
  projectId: string;
  // A workspace of the project; absent: its main folder.
  cwd?: string;
  prompt: string;
  images?: PromptImage[];
  requestId: string;
  // Absent: the agent's default.
  choice?: ModelChoice;
  startedBy?: string;
  // Starts in a new worktree named after the session (a new folder, for a
  // chat); `cwd` is ignored.
  worktree?: boolean;
  agent?: AgentId;
  // Its parent hears nothing of its runs.
  quiet?: boolean;
  // Holds the prompt for tonight's run (docs/night-runs.md) instead of
  // sending it, as the Night agent.
  tonight?: boolean;
}

export async function createSession({
  projectId,
  cwd,
  prompt,
  images = [],
  requestId,
  choice,
  startedBy,
  worktree,
  agent: agentId = 'coding',
  quiet,
  tonight,
}: NewSession) {
  if (tonight) {
    if (!prompt) throw new Error('A night run needs a prompt');
    if (images.length)
      throw new Error('A night run takes text only, without images');
    agentId = 'night';
  }
  const agent = getAgent(agentId);
  // A chat gets a fresh folder; its name needn't wait for the fast model.
  if (worktree && projectId === CHATS_ID) {
    cwd = await createChatFolder(promptTitle(prompt) || 'chat');
    worktree = false;
  }
  const project = await getProject(projectId);
  // The branch needs a name now, so the title is waited for here.
  const named = worktree ? await nameSession(prompt) : '';
  if (worktree) {
    cwd = await createWorktree(projectId, named || promptTitle(prompt));
    const command = await setupCommand(projectId, cwd);
    if (command) {
      const id = await createTerminal(
        { projectId, cwd },
        { command, title: 'Setup' },
      );
      // Like Zed's `hide: on_success`: only a failed setup stays to be read.
      void commandDone(id).then((code) => {
        if (code === 0) void removeTerminal(id);
      });
    }
  } else if (cwd && !project.workspaces.some((w) => w.path === cwd))
    throw new Error(`${cwd} is not a workspace of ${project.name}`);
  const { model, thinkingLevel } = choice
    ? checkChoice(atLeast(agent, choice))
    : await agentChoice(agent);
  const extensions = selection(agent);
  const harness = await getHarness();
  const workdir = cwd ?? project.path;
  const conversation = await harness.createConversation(
    {
      ownership: { kind: 'ownerless' },
      agent: {
        model,
        thinkingLevel,
        cwd: workdir,
        ...(extensions && { extensions }),
      },
      init: async (tx, id) => {
        const doc = await tx.doc(SessionDoc, id);
        // With a fast model the title stays empty until its name arrives, so
        // the row never shows a stand-in that then switches.
        doc.title =
          named ||
          (prompt && fastModelId() && !worktree
            ? ''
            : promptTitle(prompt) || (images.length ? 'Image' : VOICE_TITLE));
        doc.createdAt = Date.now();
        doc.projectId = projectId;
        doc.seenEntry = 0;
        doc.profile = agentId;
        if (startedBy) doc.startedBy = startedBy;
        if (quiet) doc.quiet = true;
        if (tonight) doc.tonight = prompt;
        doc.userPrompted = !startedBy;
      },
    },
    context,
  );
  // Nothing to send: started for a voice call, whose first handoff names it.
  if (!tonight && (prompt || images.length))
    await submit(
      String(conversation.id),
      prompt,
      images,
      requestId,
      startedBy ?? 'user',
    );
  // Not awaited: the session opens now and the title swaps in when ready.
  if (prompt && !worktree) void retitle(conversation.id, prompt);
  return String(conversation.id);
}

/**
 * A session started by another session's agent: a normal, ownerless coding
 * session in the parent's folder, another workspace of any project, or a new
 * worktree of that project. It takes the parent's model, except from a hub,
 * whose fast model is picked for routing, not for the work. `effort`
 * overrides the effort; a level the model lacks is clamped.
 */
export async function spawnSession(
  parent: ConversationId,
  prompt: string,
  requestId: string,
  folder?: string,
  worktree?: boolean,
  quiet?: boolean,
  agent: Exclude<AgentId, 'hub'> = 'coding',
  tonight?: boolean,
  effort?: ThinkingLevel,
) {
  const harness = await getHarness();
  const [meta, parentAgent] = await Promise.all([
    harness.snapshot(SessionDoc, parent, context),
    harness.snapshot(AgentDoc, parent, context),
  ]);
  let projectId = meta?.projectId;
  let cwd = parentAgent?.cwd;
  if (folder) {
    const path = folder.replace(/\/+$/, '');
    const owner = (await listProjects()).find((p) =>
      p.workspaces.some((w) => w.path === path),
    );
    if (!owner)
      throw new Error(`${path} is not a folder or worktree of any project`);
    projectId = owner.id;
    cwd = path;
  }
  if (!projectId || !cwd)
    throw new Error('Pass `folder`: a project folder or worktree');
  let choice: ModelChoice | undefined =
    agentIdOf(meta) !== 'hub' && parentAgent?.model && parentAgent.thinkingLevel
      ? { model: parentAgent.model, thinkingLevel: parentAgent.thinkingLevel }
      : undefined;
  if (effort) {
    const base = choice ?? (await agentChoice(getAgent(agent)));
    choice = checkChoice({ ...base, thinkingLevel: effort });
  }
  return createSession({
    projectId,
    cwd,
    prompt,
    requestId,
    choice,
    startedBy: String(parent),
    worktree,
    quiet,
    agent,
    tonight,
  });
}

/**
 * A new session with this one's history up to `at` (default: all of it).
 * The original is untouched; files on disk are shared, not copied.
 */
export async function fork(id: string, at?: number) {
  const conversation = await getConversation(id);
  const entry = at ?? (await newestEntry(conversation.id))?.id;
  if (entry === undefined) throw new Error('Nothing to fork yet');
  const forked = await conversation.fork(
    entry as EntryId,
    {
      ownership: { kind: 'ownerless' },
      // SessionDoc forks with the parent's current value: title, project.
      init: async (tx, newId) => {
        const doc = await tx.doc(SessionDoc, newId);
        doc.title = `${doc.title || 'Session'} (fork)`.slice(0, 200);
        doc.createdAt = Date.now();
        doc.archivedAt = 0;
        doc.forkedFrom = id;
        doc.forkedAt = entry;
        doc.startedBy = '';
        doc.seenEntry = entry;
        delete doc.watchers;
        delete doc.messaged;
        delete doc.handoffs;
      },
    },
    context,
  );
  await sessions.refresh();
  return String(forked.id);
}
