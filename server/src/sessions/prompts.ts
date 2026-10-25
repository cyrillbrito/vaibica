import {
  AgentDoc,
  type ConversationId,
  InboxDoc,
  type InboxItem,
  LiveDoc,
} from '@earendil-works/pi-durable';

import { PRUNE_ENTRY, pruneEdits, prunedTokens } from '@bica/shared/prune';
import type { ModelChoice, PromptImage } from '@bica/shared/protocol';
import { context, getHarness } from '../harness';
import { getAgent } from '../agents/registry';
import { loadMemory, projectList } from '../agents/common';
import { defaultChoice } from '../models/models';
import { checkChoice, models } from '../models/registry';
import { agentIdOf, editSession, getConversation, sessionMeta } from './store';

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
  if ((await sessionMeta(conversation.id))?.tonight)
    throw new Error(
      'This session is held for tonight: edit its prompt, or run it now',
    );
  await keepCopies(conversation.id);
  await keepModel(conversation.id);
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
  return editSession(id, (meta) => {
    meta.lastFrom = from;
    if (from !== 'user' || keep || meta.userPrompted) return undefined;
    meta.userPrompted = true;
    if (!meta.startedBy) return undefined;
    meta.handoffs = [...(meta.handoffs ?? []), { at: Date.now(), to: 'you' }];
    return meta.startedBy;
  });
}

/**
 * Takes the memory index, and the project list for an agent with a
 * `projects` section such as the hub's, when the session holds
 * no copy: at its first prompt and after a compaction (store.ts). The prompt sections
 * show the copies (server/src/agents/registry.ts), since the agent
 * edits memory mid-session and every change would be sent again. Every
 * prompt path calls it, voice included.
 */
export async function keepCopies(id: ConversationId) {
  const [agent, meta] = await Promise.all([
    (await getHarness()).snapshot(AgentDoc, id, context),
    sessionMeta(id),
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
  await editSession(id, (meta) => void Object.assign(meta, taken));
}

/**
 * Moves a session off a model no provider reaches any more, such as one from
 * a removed provider, so the prompt isn't left unanswered with `no_model`.
 * The same model through another provider comes first, then the default.
 */
export async function keepModel(id: ConversationId) {
  const agent = await (await getHarness()).snapshot(AgentDoc, id, context);
  const ref = agent?.model;
  if (ref && models.getModel(ref.provider, ref.modelId)) return;
  const twin =
    ref && (await models.getAvailable()).find((m) => m.id === ref.modelId);
  const choice = twin
    ? {
        model: { provider: twin.provider, modelId: twin.id },
        thinkingLevel: agent?.thinkingLevel ?? 'medium',
      }
    : await defaultChoice();
  await (
    await getConversation(String(id))
  ).configure(checkChoice(choice), context);
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
 * Sends a queued follow-up after the current turn instead of after the run.
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

/** Switches the model or effort; the next request uses it. */
export async function configure(id: string, choice: ModelChoice) {
  await (await getConversation(id)).configure(checkChoice(choice), context);
}

/** Summarizes older context now; the summary lands at the next boundary. */
export async function compact(id: string, instructions?: string) {
  const conversation = await getConversation(id);
  await conversation.compact(instructions?.trim() || undefined, context);
}

/**
 * Clears old tool output from the model context (shared/src/prune.ts). The
 * transcript keeps everything; only what the model reads changes. While the
 * agent works, the edits land at its next step, like a steer. Resolves once
 * they landed, with the tokens freed.
 */
export async function pruneContext(id: string) {
  const conversation = await getConversation(id);
  const harness = await getHarness();
  // A summary in the works would hide the entries the edits target.
  if (
    (await harness.snapshot(LiveDoc, conversation.id, context))?.compactions
      ?.length
  )
    throw new Error('Wait for the compaction to finish, then prune');
  const view = await conversation.context(context);
  const edits = pruneEdits(view);
  if (!edits.length) return 0;
  const freed = Math.round(prunedTokens(view, edits));
  const submission = await conversation.submit(
    { type: 'write', entry: { kind: PRUNE_ENTRY, edits, data: { freed } } },
    context,
  );
  await submission.wait(context);
  return freed;
}
