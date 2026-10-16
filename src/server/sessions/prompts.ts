import 'server-only';
import {
  AgentDoc,
  type ConversationId,
  InboxDoc,
  type InboxItem,
  LiveDoc,
} from '@earendil-works/pi-durable';

import { CLEANUP_ENTRY, cleanupEdits } from '#lib/cleanup';
import type { ModelChoice, PromptImage } from '#lib/protocol';
import { context, getHarness } from '#server/agent';
import { serverProfile, loadMemory } from '#server/profiles';
import { checkChoice } from '#server/providers';
import { SessionDoc, getConversation, profileOf } from './store';

/** Who sends a prompt: the user, Tau's own notes, or another session's id. */
export type Sender = 'user' | 'tau' | (string & {});

export async function submit(
  id: string,
  prompt: string,
  images: PromptImage[],
  requestId: string,
  from: Sender,
  whenBusy: 'followUp' | 'steer' = 'followUp',
) {
  const conversation = await getConversation(id);
  await refreshInstructions(conversation);
  await recordSender(conversation.id, from);
  // Pi Durable returns the existing submission for a repeated requestId.
  await conversation.submit(
    { type: 'input', content: input(prompt, images), requestId, whenBusy },
    context,
  );
}

/** Notes who sent the newest prompt, for session_read and notes. */
export async function recordSender(id: ConversationId, from: Sender) {
  await (
    await getHarness()
  ).commit(async (tx) => {
    const doc = await tx.doc(SessionDoc, id);
    doc.lastFrom = from;
    if (from === 'user') doc.userPrompted = true;
  }, context);
}

/**
 * Picks up AGENTS.md edits and the profile, and gives older sessions
 * instructions at all. Every prompt path calls it, voice included.
 * Pi Durable only patches the system prompt when the text changed.
 */
export async function refreshInstructions(
  conversation: Awaited<ReturnType<typeof getConversation>>,
) {
  const harness = await getHarness();
  const [agent, meta] = await Promise.all([
    harness.snapshot(AgentDoc, conversation.id, context),
    harness.snapshot(SessionDoc, conversation.id, context),
  ]);
  if (!agent?.cwd) return;
  const profile = profileOf(meta);
  let memory = meta?.memory;
  let projects = meta?.projects;
  if (memory === undefined || projects === undefined) {
    const taken = {
      memory: (memory ??= await loadMemory(agent.cwd)),
      projects: (projects ??= await serverProfile(profile).projects()),
    };
    await harness.commit(async (tx) => {
      Object.assign(await tx.doc(SessionDoc, conversation.id), taken);
    }, context);
  }
  const instructions = await serverProfile(profile).instructions({
    cwd: agent.cwd,
    memory,
    projects,
  });
  if (instructions !== agent.instructions)
    await conversation.configure({ instructions }, context);
}

export type QueuedInput = Extract<InboxItem, { content: unknown }>;

export async function queued(conversationId: ConversationId) {
  const inbox = await (
    await getHarness()
  ).snapshot(InboxDoc, conversationId, context);
  return (inbox?.items ?? []).filter(
    (item): item is QueuedInput => item.mode !== 'write',
  );
}

/** Takes a queued prompt out of the queue; undefined if it was already sent. */
async function unqueue(id: string, submissionId: number) {
  const conversation = await getConversation(id);
  const item = (await queued(conversation.id)).find(
    (i) => Number(i.id) === submissionId,
  );
  if (!item) return undefined;
  const result = await (
    await getHarness()
  ).abortSubmission(item.id, context, conversation.id);
  return result === 'aborted' ? { conversation, item } : undefined;
}

/**
 * Takes a queued prompt back out. null: it was already sent (or is gone), so
 * there is nothing to give back.
 */
export async function withdraw(id: string, submissionId: number) {
  const taken = await unqueue(id, submissionId);
  return taken ? toPrompt(taken.item.content) : null;
}

/**
 * Sends a queued follow-up after the current step instead of after the run.
 * Pi Durable can't change a queued item, so it is withdrawn and steered anew;
 * false: it was already sent.
 */
export async function push(id: string, submissionId: number) {
  const taken = await unqueue(id, submissionId);
  if (!taken) return false;
  await taken.conversation.submit(
    { type: 'input', content: taken.item.content as never, whenBusy: 'steer' },
    context,
  );
  return true;
}

/**
 * Stops the run. Pi Durable drops queued prompts on abort; they are returned
 * so the browser can put them back in the prompt box.
 */
export async function stop(id: string) {
  const conversation = await getConversation(id);
  const items = await queued(conversation.id);
  await conversation.abort(context);
  return items.map((i) => toPrompt(i.content));
}

function toPrompt(content: QueuedInput['content']) {
  if (typeof content === 'string') return { prompt: content, images: [] };
  const blocks = content as readonly {
    type: string;
    text?: string;
    mimeType?: string;
    data?: string;
  }[];
  return {
    prompt: blocks
      .flatMap((b) => (b.type === 'text' && b.text ? [b.text] : []))
      .join('\n'),
    images: blocks.flatMap((b) =>
      b.type === 'image' && b.mimeType && b.data
        ? [{ mimeType: b.mimeType, data: b.data }]
        : [],
    ),
  };
}

/** Plain text, or text and images as content blocks. */
export function input(prompt: string, images: PromptImage[]) {
  if (!images.length) return prompt;
  return [
    ...(prompt ? [{ type: 'text' as const, text: prompt }] : []),
    ...images.map((i) => ({ type: 'image' as const, ...i })),
  ];
}

/** Switches the model or effort; the next answer uses it. */
export async function configure(id: string, choice: ModelChoice) {
  await (await getConversation(id)).configure(checkChoice(choice), context);
}

/** Summarizes older context now; the summary lands at the next boundary. */
export async function compact(id: string, instructions?: string) {
  const conversation = await getConversation(id);
  await conversation.compact(instructions?.trim() || undefined, context);
  // The cache starts over anyway: the next prompt takes a fresh memory index
  // and project list.
  await (
    await getHarness()
  ).commit(async (tx) => {
    const doc = await tx.doc(SessionDoc, conversation.id);
    delete doc.memory;
    delete doc.projects;
  }, context);
}

/**
 * Clears old tool output from the model context (src/lib/cleanup.ts). The
 * transcript keeps everything; only what the model reads changes.
 */
export async function cleanUpContext(id: string) {
  const conversation = await getConversation(id);
  const harness = await getHarness();
  if ((await harness.snapshot(LiveDoc, conversation.id, context))?.run)
    throw new Error('Wait for the agent to finish, then clean up');
  const view = await conversation.context(context);
  const current = new Map(
    view.entries.map((e, i) => [e.id, view.contributions[i]] as const),
  );
  const edits = cleanupEdits(view.entries, (e) => current.get(e.id));
  if (!edits.length) return;
  await conversation.submit(
    { type: 'write', entry: { kind: CLEANUP_ENTRY, edits } },
    context,
  );
}
