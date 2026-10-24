import { Title } from '@solidjs/meta';
import { useLocation, useNavigate, type RouteProps } from '@solidjs/router';
import type { ConversationView, LiveState } from '@earendil-works/pi-durable';
import {
  type Accessor,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
} from 'solid-js';
import type { JSX } from '@solidjs/web';
import { createStickToBottom } from '#lib/stick-to-bottom';
import { arriveOnChange } from '#lib/arrive';
import CallBar from '../../components/CallBar';
import Composer, { type ComposerApi } from '../../components/Composer';
import ContextMeter from '../../components/ContextMeter';
import ContextNag from '../../components/ContextNag';
import MessageRow, { RULE } from '../../components/MessageRow';
import ModelPicker from '../../components/ModelPicker';
import OpenFile from '../../components/OpenFile';
import ParentStrip from '../../components/ParentStrip';
import StuckStrip from '../../components/StuckStrip';
import TonightStrip from '../../components/TonightStrip';
import Queue from '../../components/Queue';
import StatusDot from '../../components/StatusDot';
import TitleInput from '../../components/TitleInput';
import TopBar from '../../components/TopBar';
import { IconButton } from '../../components/ui/Button';
import Empty from '../../components/ui/Empty';
import {
  CloseIcon,
  ParentIcon,
  SessionIcon,
  VoiceIcon,
} from '../../components/ui/icons';
import { drawer, hasPanels, setNoPanels } from '#lib/layout';
import {
  openFromSearch,
  sameOpen,
  sessionFileHref,
  useCurrentWorkspace,
} from '#lib/workspace';
import { paths } from '../../router';
import { sessionChoice, setOpenModel } from '#lib/models';
import {
  configureSession,
  forkSession,
  isCleaning,
  markSeen,
  handBack,
  sendPrompt,
  stopSession,
  tonightAction,
  useConversation,
  useHub,
  useSessions,
} from '#lib/sessions';
import { pageFocused } from '#lib/badge';
import { createStopwatch, formatLive } from '#lib/time';
import { readError } from '#lib/error-message';
import { type ContextUsage } from '#lib/context-usage';
import { SessionId } from '#lib/step-detail';
import { hideThinking } from '#lib/thinking';
import { call, startCall } from '#lib/voice';
import {
  promptAt,
  toMessages,
  viewStatus,
  type Message,
} from '#lib/transcript';

/**
 * The agent is on it but nothing has streamed yet: a shimmering word and a
 * live timer, after affectUI's Thinking State. A failed attempt waiting to
 * retry says so, with the reason on hover.
 */
function Working(props: {
  since?: number;
  retry?: { at: number; error: string };
}) {
  const now = createStopwatch(() => true);
  return (
    <div
      role="status"
      class="appear flex min-w-0 items-center gap-2 text-meta text-muted"
    >
      <span class={['text-ui', props.retry ? 'text-warn-ink' : 'shimmer']}>
        {props.retry ? 'Retrying' : 'Working'}
      </span>
      <Show
        when={props.retry}
        fallback={
          <Show
            when={props.since && formatLive(Math.max(0, now() - props.since))}
          >
            {(t) => <span class="tabular-nums">{t()}</span>}
          </Show>
        }
      >
        {(retry) => (
          <span class="min-w-0 truncate" title={retry().error}>
            <span class="tabular-nums">
              {retry().at > now()
                ? `in ${Math.ceil((retry().at - now()) / 1000)}s`
                : 'now'}
            </span>
            {' · '}
            {readError(retry().error).message}
          </span>
        )}
      </Show>
    </div>
  );
}

export default function Session(props: RouteProps<'/s/:id'>) {
  const view = useConversation(() => props.params.id!);
  const sessions = useSessions();
  // Titles and read state are ours, not Pi Durable's; they come with the list.
  const summary = createMemo(
    () => sessions().find((s) => s.id === props.params.id),
    { name: 'sessionSummary' },
  );
  const title = () => summary()?.title || '…';
  const titleRef = arriveOnChange(
    () => summary()?.title,
    () => props.params.id!,
  );

  // A background or unfocused tab hasn't been read, even with the session
  // open in it.
  createEffect(
    () =>
      pageFocused() && summary()?.status === 'done'
        ? props.params.id
        : undefined,
    (id) => {
      if (id) void markSeen(id);
    },
    { name: 'markSeen' },
  );
  // A session without panels hides the files and changes panel while open.
  createEffect(
    () => (summary() ? !hasPanels(summary()!.agent) : false),
    (hide) => {
      setNoPanels(hide);
      return () => setNoPanels(false);
    },
    { name: 'noPanels' },
  );
  const [renaming, setRenaming] = createSignal(false);
  const navigate = useNavigate();
  // A file opened from the right panel shows over the chat, which stays
  // mounted underneath: closing it is back to the same draft and scroll.
  const location = useLocation();
  const workspace = useCurrentWorkspace();
  const open = createMemo(() => openFromSearch(location.search), {
    name: 'fileOverChat',
    equals: sameOpen,
  });
  const closeFile = () => navigate(paths.s(props.params.id!)());
  onSettled(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open() && !drawer() && !e.defaultPrevented)
        closeFile();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  const parent = createMemo(
    () => sessions().find((s) => s.id === summary()?.forkedFrom),
    { name: 'forkParent' },
  );
  const starter = createMemo(
    () => sessions().find((s) => s.id === summary()?.startedBy),
    { name: 'starter' },
  );
  const drives = () => !!summary()?.parentDrives;
  // The prompt held for tonight, which the composer edits.
  const held = () => summary()?.tonight ?? null;
  // "Keep parent in charge", for the open session only.
  // Hovering any part of an answer shows the fork button at its end, or the
  // next compaction or clean up line, which has its own.
  let shown: Element | undefined;
  const forks = ['end', 'compaction', 'cleanup'];
  const showFork = (e?: PointerEvent) => {
    let row = (e?.target as Element | undefined)?.closest('[data-kind]');
    while (row && ![...forks, 'user'].includes(row.getAttribute('data-kind')!))
      row = row.nextElementSibling ?? undefined;
    const end =
      row && forks.includes(row.getAttribute('data-kind') ?? '')
        ? row
        : undefined;
    if (end === shown) return;
    shown?.removeAttribute('data-show');
    end?.setAttribute('data-show', '');
    shown = end;
  };
  // The hub has its own page; links and notifications to it land there.
  const hub = useHub();
  createEffect(
    () => !!hub() && hub()!.id === props.params.id,
    (isHub) => {
      if (isHub) navigate(paths.hub(), { replace: true });
    },
    { name: 'hubRedirect' },
  );
  const forkAt = async (at: number) =>
    navigate(paths.s(await forkSession(props.params.id!, at))());
  // A number, so list refreshes don't rebuild the transcript.
  const forkedAt = createMemo(() => summary()?.forkedAt ?? undefined, {
    name: 'forkedAt',
  });
  const messages = createMemo(() => {
    const v = view();
    return v ? toMessages(v, forkedAt(), { thinking: !hideThinking() }) : [];
  });
  // Each change of driver as a line, before the first prompt sent after it.
  const rows = createMemo(
    () => {
      const list = messages();
      const handoffs = summary()?.handoffs ?? [];
      const cleaning = isCleaning(props.params.id!);
      if (!handoffs.length && !cleaning) return list;
      const out = [...list];
      for (const h of handoffs.toSorted((a, b) => b.at - a.at)) {
        const i = out.findIndex((m) => (promptAt(m) ?? -1) >= h.at);
        out.splice(i === -1 ? out.length : i, 0, {
          key: `handoff:${h.at}`,
          kind: 'handoff',
          to: h.to,
        });
      }
      if (cleaning)
        out.push({
          key: 'cleaning',
          kind: 'cleaning',
          running: !!(view()?.docs['pi.live'] as LiveState | undefined)?.run,
        });
      return out;
    },
    { name: 'transcriptRows' },
  );
  // The run started but nothing streamed yet, or the provider failed and a
  // retry waits: a pill at the bottom says it's on it.
  const waiting = createMemo(
    () => {
      const live = view()?.docs['pi.live'] as LiveState | undefined;
      if (!live?.run) return undefined;
      const retry = live.generation?.retry;
      const last = messages().at(-1);
      const since = last && promptAt(last);
      if (!retry && last && since === undefined) return undefined;
      return {
        since,
        retry,
      };
    },
    {
      name: 'waitingOnAgent',
      equals: (a, b) =>
        a?.since === b?.since &&
        a?.retry?.at === b?.retry?.at &&
        a?.retry?.error === b?.retry?.error,
    },
  );
  // Worked out by the server, which holds the full conversation; shared by
  // the chip and the nag above the composer.
  const usage = createMemo(
    () => view()?.docs['bica.context'] as ContextUsage | undefined,
    { name: 'contextUsage' },
  );
  const lastCompaction = createMemo(
    () =>
      messages().findLast(
        (m): m is Extract<Message, { kind: 'compaction' }> =>
          m.kind === 'compaction',
      ),
    { name: 'lastCompaction' },
  );
  const lastCleanup = createMemo(
    () =>
      messages().findLast(
        (m): m is Extract<Message, { kind: 'cleanup' }> => m.kind === 'cleanup',
      ),
    { name: 'lastCleanup' },
  );

  // From the list, not the transcript: the composer is ready before it loads.
  const busy = createMemo(
    () => ['running', 'retrying'].includes(summary()?.status ?? ''),
    { name: 'sessionBusy' },
  );
  // A session opens at its newest message, also when switching to another.
  const stick = createStickToBottom();
  createEffect(
    () => props.params.id,
    () => stick.follow(),
    { name: 'followOnSwitch' },
  );
  let composer: ComposerApi | undefined;
  // The title, top bar, and composer come from the list, which is already
  // here. The parts that need the transcript appear when it lands, each in
  // place, so switching sessions shows the page at once and fills it in.
  const Ready = (p: {
    children: (view: Accessor<ConversationView>) => JSX.Element;
  }) => <Show when={view()}>{p.children}</Show>;
  // The agent's model, under the prompt and under a call alike.
  const modelPicker = () => (
    <Ready>
      {(v) => (
        <ModelPicker
          value={sessionChoice(v())}
          onChange={(choice) => void configureSession(props.params.id!, choice)}
        />
      )}
    </Ready>
  );

  return (
    <Show
      when={!!summary()}
      fallback={
        <>
          <TopBar />
          <Empty>Session not found</Empty>
        </>
      }
    >
      <Title>{title()}</Title>
      <TopBar
        actions={
          <Ready>
            {(v) => (
              <ContextMeter
                id={props.params.id!}
                view={v()}
                usage={usage()!}
                agent={summary()?.agent ?? 'coding'}
                voice={summary()?.voice ?? null}
              />
            )}
          </Ready>
        }
      >
        {/* The open session is always read: only show a state worth noticing. */}
        <Ready>
          {(v) => (
            <Show when={viewStatus(v()) !== 'idle'}>
              <StatusDot status={viewStatus(v())} />
            </Show>
          )}
        </Ready>
        <Show
          when={renaming()}
          fallback={
            // Negative margin on the h1, not the button: on the button it
            // shrinks the h1 below the button's width, always truncating.
            <h1 class="-mx-1.5 min-w-0">
              <button
                class="block max-w-full truncate rounded-md px-1.5 py-0.5 font-semibold transition-colors hover:bg-hover"
                title="Rename"
                onClick={() => setRenaming(true)}
              >
                <span ref={titleRef}>{title()}</span>
              </button>
            </h1>
          }
        >
          <TitleInput
            id={props.params.id!}
            value={summary()?.title ?? ''}
            onClose={() => setRenaming(false)}
            class="-mx-1.5 max-w-120 py-0.5 font-semibold"
          />
        </Show>
        <Show when={drives() && starter()}>
          {(parent) => (
            <a
              class="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-meta text-accent-ink transition-colors hover:bg-hover [&_svg]:size-3.5"
              href={paths.s(parent().id)}
              title="Its parent session is in charge. Open the parent."
            >
              <ParentIcon />
              <span class="max-md:hidden">Parent in charge</span>
            </a>
          )}
        </Show>
      </TopBar>
      <div class="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={stick.scroller}
          class="flex flex-1 flex-col overflow-y-auto overscroll-contain border-t border-line"
          inert={!!open()}
        >
          <div
            ref={stick.content}
            class="chat-column flex flex-1 flex-col gap-5 pt-8"
            onPointerOver={showFork}
            onPointerLeave={() => showFork()}
          >
            <Show when={starter()}>
              {(starter) => (
                <a
                  class={[RULE, 'min-w-0 self-center hover:text-fg']}
                  href={paths.s(starter().id)}
                >
                  <SessionIcon />
                  <span class="truncate">
                    Started by {starter().title || 'another session'}
                  </span>
                </a>
              )}
            </Show>
            <Ready>
              {(v) => {
                // The sidebar shows only this model's plan.
                createEffect(
                  () => {
                    const model = sessionChoice(v())?.model;
                    return model && `${model.provider}/${model.modelId}`;
                  },
                  (key) => {
                    const [provider, ...rest] = key?.split('/') ?? [];
                    setOpenModel(
                      provider
                        ? { provider, modelId: rest.join('/') }
                        : undefined,
                    );
                    return () => setOpenModel(undefined);
                  },
                  { name: 'openModel' },
                );
                return (
                  <SessionId value={() => props.params.id!}>
                    {/* Every change derives fresh objects; the key keeps rows. */}
                    <For
                      each={rows()}
                      keyed={(m) => m.key}
                      fallback={
                        <div class="text-center text-muted">
                          No messages yet
                        </div>
                      }
                    >
                      {(m) => (
                        <MessageRow
                          message={m()}
                          onFork={forkAt}
                          onAnswer={(text) => {
                            stick.follow();
                            // Answering what it asks leaves it with its parent.
                            return sendPrompt(props.params.id!, text, [], {
                              keep: true,
                            });
                          }}
                          parent={parent()}
                          cwd={summary()?.cwd ?? undefined}
                        />
                      )}
                    </For>
                    <Show when={waiting()}>
                      {(w) => <Working since={w().since} retry={w().retry} />}
                    </Show>
                  </SessionId>
                );
              }}
            </Ready>
          </div>
          {/* Sticky inside the scroller, so the transcript scrolls behind it
              and the scroll height already counts it. */}
          <div
            ref={stick.content}
            class="pointer-events-none sticky bottom-0 bg-[linear-gradient(to_bottom,transparent,var(--color-bg)_--spacing(8))] pt-8"
          >
            <div class="chat-column pointer-events-auto pb-[max(--spacing(4),env(safe-area-inset-bottom))]">
              <CallBar
                id={props.params.id!}
                busy={busy()}
                controls={modelPicker()}
              />
              {/* Hidden, not removed, during a call: a draft survives it. */}
              <div hidden={call()?.sessionId === props.params.id}>
                <Composer
                  draft={props.params.id!}
                  onSend={(prompt, images, steer, alternate) => {
                    // Sending means wanting to see the reply.
                    stick.follow();
                    if (held() !== null)
                      return tonightAction(props.params.id!, 'run', prompt);
                    return sendPrompt(props.params.id!, prompt, images, {
                      steer,
                      keep: drives() && alternate,
                    });
                  }}
                  hold={held()}
                  onHoldEdit={(id, text) => tonightAction(id, 'save', text)}
                  placeholder={
                    held() !== null
                      ? 'What to do tonight…'
                      : drives()
                        ? 'Write to take over…'
                        : undefined
                  }
                  busyPlaceholder={
                    drives() ? 'Queue a message to take over…' : undefined
                  }
                  sendLabel={
                    held() !== null
                      ? 'Run now'
                      : drives()
                        ? 'Take over'
                        : undefined
                  }
                  alternate={held() === null && drives() ? 'Send' : undefined}
                  busy={busy()}
                  // The stop drops queued prompts; give them back to edit.
                  onStop={() =>
                    stopSession(props.params.id!).then((dropped) => {
                      for (const p of dropped)
                        composer?.restore(p.prompt, p.images);
                    })
                  }
                  ref={(api) => (composer = api)}
                  top={
                    <Ready>
                      {(v) => (
                        <>
                          <Show when={held() !== null}>
                            <TonightStrip
                              id={props.params.id!}
                              onCancel={() => composer?.releaseHold()}
                            />
                          </Show>
                          <Show when={summary()?.stuck}>
                            {(stuck) => (
                              <StuckStrip
                                id={props.params.id!}
                                stuck={stuck()}
                              />
                            )}
                          </Show>
                          <Show when={summary()?.startedBy}>
                            <ParentStrip
                              parent={starter()}
                              parentDrives={drives()}
                              onHandBack={() => handBack(props.params.id!)}
                            />
                          </Show>
                          <ContextNag
                            id={props.params.id!}
                            usage={usage()!}
                            compaction={lastCompaction()}
                            cleanup={lastCleanup()}
                          />
                          <Queue
                            id={props.params.id!}
                            view={v()}
                            composer={() => composer}
                          />
                        </>
                      )}
                    </Ready>
                  }
                  controls={modelPicker()}
                  actions={
                    <IconButton
                      size="md"
                      title="Voice call"
                      hidden={held() !== null}
                      onClick={() => void startCall(props.params.id!)}
                    >
                      <VoiceIcon />
                    </IconButton>
                  }
                />
              </div>
            </div>
          </div>
        </div>
        <Show when={workspace() && open()}>
          {(o) => (
            <section
              class="absolute inset-0 z-10 flex flex-col border-t border-line bg-bg"
              aria-label={o().path}
            >
              <OpenFile
                workspace={workspace()!}
                open={o()}
                href={(x) => sessionFileHref(props.params.id!, x)}
                actions={
                  <IconButton
                    size="md"
                    title="Back to the session (Esc)"
                    onClick={closeFile}
                  >
                    <CloseIcon />
                  </IconButton>
                }
              />
            </section>
          )}
        </Show>
      </div>
    </Show>
  );
}
