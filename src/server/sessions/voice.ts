import 'server-only';
import {
  LiveDoc,
  type ConversationId,
  type EntryRecord,
} from '@earendil-works/pi-durable';

import { VOICE_ENTRY, type VoiceLine } from '#lib/transcript';
import { context, getHarness } from '#server/agent';
import { VOICE_TITLE, retitle } from './names';
import { recordSender, refreshInstructions } from './prompts';
import { textOf } from './read';
import { SessionDoc, getConversation, sessionWorkspace } from './store';

/** The text an entry's last assistant or user message says. */
const entryText = (entry: EntryRecord | undefined) =>
  textOf(entry?.model?.at(-1)?.content ?? '');

/**
 * What a voice call (src/server/voice.ts) does with its session: hand it
 * work, follow its progress, and keep what was said in the transcript.
 */
export async function voiceSession(sessionId: string) {
  const conversation = await getConversation(sessionId);
  const id: ConversationId = conversation.id;
  const harness = await getHarness();
  let named = false;
  return {
    settings: async () =>
      (await harness.snapshot(SessionDoc, id, context))?.voice,
    cwd: async () => (await sessionWorkspace(id)).cwd,
    busy: async () => !!(await harness.snapshot(LiveDoc, id, context))?.run,
    abort: () => conversation.abort(context),

    /** The last prompts and replies, newest last, at most `chars` long. */
    async recent(chars: number) {
      const page = await conversation.entries({}, 40, undefined, context);
      const lines: string[] = [];
      let length = 0;
      for (const entry of page.items) {
        const role = entry.model?.at(-1)?.role;
        if (role !== 'user' && role !== 'assistant') continue;
        const text = entryText(entry).slice(0, 1500);
        if (!text) continue;
        lines.unshift(`${role === 'user' ? 'User' : 'Agent'}: ${text}`);
        if ((length += text.length) > chars) break;
      }
      return lines.join('\n\n');
    },

    /** The text of each step between tool calls, as the agent works. */
    onProgress(listener: (text: string) => void) {
      return harness.subscribeCommits(({ changes }) => {
        for (const change of changes) {
          if (change.type !== 'entry' || change.value.conversationId !== id)
            continue;
          const message = change.value.model?.at(-1);
          if (message?.role !== 'assistant' || message.stopReason !== 'toolUse')
            continue;
          const text = entryText(change.value);
          if (text) listener(text);
        }
      });
    },

    /**
     * Hands a request to the agent, after anything already queued, and
     * resolves with its reply. A session started for the call is named
     * after what was first asked.
     */
    async ask(request: string) {
      if (!named) {
        named = true;
        void retitle(id, request, VOICE_TITLE);
      }
      await refreshInstructions(conversation);
      await recordSender(id, 'user');
      const submission = await conversation.submit(
        { type: 'input', content: request, whenBusy: 'followUp' },
        context,
      );
      const settled = await submission.wait(context);
      const answer = settled.answer;
      return answer
        ? entryText(await harness.commit((tx) => tx.entry(answer), context))
        : `It stopped without an answer (${settled.reason}).`;
    },

    /** What was said, in the transcript but outside the agent's context. */
    save(line: VoiceLine) {
      conversation
        .submit(
          { type: 'write', entry: { kind: VOICE_ENTRY, data: line } },
          context,
        )
        .catch((error) => console.error('[voice] transcript', error));
    },
  };
}
