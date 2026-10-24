import { For, Show, createEffect, createMemo } from 'solid-js';

import { pageFocused } from '#lib/badge';
import { useAwaits } from '#lib/extensions';
import {
  markSeen,
  sendPrompt,
  stopSession,
  useConversation,
  useSessions,
} from '#lib/sessions';
import { SessionId } from '#lib/step-detail';
import { createStickToBottom } from '#lib/stick-to-bottom';
import { hideThinking } from '#lib/thinking';
import { toMessages } from '#lib/transcript';
import { call, startCall } from '#lib/voice';
import CallBar from '../CallBar';
import Composer, { type ComposerApi } from '../Composer';
import MessageRow from '../MessageRow';
import Queue from '../Queue';
import { IconButton } from '../ui/Button';
import { VoiceIcon } from '../ui/icons';

/**
 * The hub's conversation: the transcript, then a composer with a voice call
 * button. No fork, compaction, model, or agent controls: the hub is one
 * session that keeps its own memory, with its model set in Settings.
 */
export default function HubChat(props: { id: string }) {
  const view = useConversation(() => props.id);
  const sessions = useSessions();
  const status = createMemo(
    () => sessions().find((s) => s.id === props.id)?.status,
    { name: 'hubStatus' },
  );
  const busy = () => status() === 'running' || status() === 'retrying';
  const awaits = useAwaits();
  const messages = createMemo(
    () => {
      const v = view();
      return v
        ? toMessages(v, undefined, {
            thinking: !hideThinking(),
            awaits: awaits(),
          })
        : [];
    },
    { name: 'hubMessages' },
  );
  // Open and focused is read.
  createEffect(
    () => pageFocused() && status() === 'done',
    (read) => {
      if (read) void markSeen(props.id);
    },
    { name: 'hubSeen' },
  );
  const stick = createStickToBottom();
  let composer: ComposerApi | undefined;

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div
        ref={stick.scroller}
        class="flex-1 overflow-y-auto overscroll-contain border-t border-line [scrollbar-gutter:stable_both-edges]"
      >
        <div ref={stick.content} class="chat-column flex flex-col gap-5 py-6">
          <SessionId value={() => props.id}>
            <For
              each={messages()}
              keyed={(m) => m.key}
              fallback={
                <div class="text-center text-muted">
                  Tell the hub what you're working on.
                </div>
              }
            >
              {(m) => (
                <MessageRow
                  message={m()}
                  onAnswer={(text) => {
                    stick.follow();
                    return sendPrompt(props.id, text, []);
                  }}
                />
              )}
            </For>
          </SessionId>
        </div>
      </div>
      <div class="chat-column pb-[max(--spacing(4),env(safe-area-inset-bottom))]">
        <CallBar id={props.id} busy={busy()} />
        {/* Hidden, not removed, during a call: a draft survives it. */}
        <div hidden={call()?.sessionId === props.id}>
          <Composer
            draft={props.id}
            placeholder="Tell the hub…"
            onSend={(prompt, images, steer) => {
              stick.follow();
              return sendPrompt(props.id, prompt, images, { steer });
            }}
            busy={busy()}
            // The stop drops queued prompts; give them back to edit.
            onStop={() =>
              stopSession(props.id).then((dropped) => {
                for (const p of dropped) composer?.restore(p.prompt, p.images);
              })
            }
            ref={(api) => (composer = api)}
            top={
              <Show when={view()}>
                {(v) => (
                  <Queue id={props.id} view={v()} composer={() => composer} />
                )}
              </Show>
            }
            actions={
              <IconButton
                size="md"
                title="Voice call"
                onClick={() => void startCall(props.id)}
              >
                <VoiceIcon />
              </IconButton>
            }
          />
        </div>
      </div>
    </div>
  );
}
