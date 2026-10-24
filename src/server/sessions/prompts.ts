import 'server-only';
import {
  AgentDoc,
  type ConversationId,
  type EntryRecord,
  InboxDoc,
  type InboxItem,
  LiveDoc,
} from '@earendil-works/pi-durable';

import type { Message } from '@earendil-works/pi-ai';
import { CLEANUP_ENTRY, chars, cleanupEdits } from '#lib/cleanup';
import type { ModelChoice, PromptImage } from '#lib/protocol';
import { context, getHarness } from '#server/agent';
import { getAgent, loadMemory, projectList } from '#server/agents';
import { checkChoice } from '#server/providers';
import { keepers } from './cleanup-judge';
import { SessionDoc, agentIdOf, getConversation } from './store';

/** Who sends a prompt: the user, Bica's own notes, or another session's id. */
export type Sender = 'user' | 'bica' | (string & {});

/**
 * Resolves to the session that started it when this prompt took it over
 * from there. `keep`: a prompt from the user that leaves it with its parent.
 */
export async function submit(
  id: string,
  prompt: string,
  images: PromptImage[],
  requestId: string,
  from: Sender,
  whenBusy: 'followUp' | 'steer' = 'followUp',
  keep = false,
) {
  const conversation = await getConversation(id);
  // Its one prompt waits for tonight (docs/night-runs.md); a second would run now.
  if (
    (await (await getHarness()).snapshot(SessionDoc, conversation.id, context))
      ?.tonight
  )
    throw new Error(
      'This session is held for tonight: edit its prompt, or run it now',
    );
  await keepCopies(conversation.id);
  const parent = await recordSender(conversation.id, from, keep);
  // Pi Durable returns the existing submission for a repeated requestId.
  await conversation.submit(
    { type: 'input', content: input(prompt, images), requestId, whenBusy },
    context,
  );
  return parent;
}

/**
 * Notes who sent the newest prompt, for session_read and notes. The user's
 * prompts make the session his, unless `keep`; returns its parent when that
 * just took it over.
 */
export async function recordSender(
  id: ConversationId,
  from: Sender,
  keep = false,
) {
  let parent: string | undefined;
  await (
    await getHarness()
  ).commit(async (tx) => {
    const doc = await tx.doc(SessionDoc, id);
    doc.lastFrom = from;
    if (from !== 'user' || keep || doc.userPrompted) return;
    doc.userPrompted = true;
    if (!doc.startedBy) return;
    parent = doc.startedBy;
    doc.handoffs = [...(doc.handoffs ?? []), { at: Date.now(), to: 'you' }];
  }, context);
  return parent;
}

/**
 * Takes the memory index, and the project list for an agent with a
 * `projects` section such as the hub's, when the session holds
 * no copy: at its first prompt and after a compaction. The prompt sections
 * show the copies (src/server/agents/registry.ts), since the agent
 * edits memory mid-session and every change would be sent again. Every
 * prompt path calls it, voice included.
 */
export async function keepCopies(id: ConversationId) {
  const harness = await getHarness();
  const [agent, meta] = await Promise.all([
    harness.snapshot(AgentDoc, id, context),
    harness.snapshot(SessionDoc, id, context),
  ]);
  if (!agent?.cwd) return;
  // Sessions from before the prompt sections stored their instructions.
  if (agent.instructions !== undefined)
    await (
      await getConversation(String(id))
    ).configure({ instructions: null }, context);
  if (meta?.memory !== undefined && meta.projects !== undefined) return;
  const taken = {
    memory: meta?.memory ?? (await loadMemory(agent.cwd)),
    projects:
      meta?.projects ??
      (getAgent(agentIdOf(meta)).sections.projects ? await projectList() : ''),
  };
  await harness.commit(async (tx) => {
    Object.assign(await tx.doc(SessionDoc, id), taken);
  }, context);
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
 * transcript keeps everything; only what the model reads changes. While the
 * agent works, the edits land at its next step, like a steer. Resolves once
 * they landed, with the tokens freed.
 */
export async function cleanUpContext(id: string) {
  const conversation = await getConversation(id);
  const harness = await getHarness();
  // A summary in the works would hide the entries the edits target.
  if (
    (await harness.snapshot(LiveDoc, conversation.id, context))?.compactions
      ?.length
  )
    throw new Error('Wait for the compaction to finish, then clean up');
  const view = await conversation.context(context);
  const current = new Map(
    view.entries.map((e, i) => [e.id, view.contributions[i]] as const),
  );
  const of = (e: EntryRecord) => current.get(e.id);
  const edits = cleanupEdits(view.entries, of, await keepers(view.entries, of));
  if (!edits.length) return 0;
  const size = (messages: readonly Message[] = []) =>
    messages.reduce((n, m) => n + chars(m), 0);
  const freed = Math.round(
    edits.reduce(
      (n, e) =>
        n +
        size(current.get(e.target)) -
        size(e.action === 'replace' ? e.messages : []),
      0,
    ) / 4,
  );
  const submission = await conversation.submit(
    { type: 'write', entry: { kind: CLEANUP_ENTRY, edits, data: { freed } } },
    context,
  );
  await submission.wait(context);
  return freed;
}
