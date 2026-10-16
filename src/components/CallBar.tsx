import type { JSX } from '@solidjs/web';
import { For, Show, createEffect, createMemo, onSettled } from 'solid-js';

import { useSessions } from '#lib/sessions';
import { soundOn } from '#lib/sound';
import { call, endCall, holdMusic, level, toggleMute } from '#lib/voice';
import { IconButton } from './ui/Button';
import { HangUpIcon, MicIcon, MicOffIcon } from './ui/icons';

// Each bar's share of the level, so the meter has a shape at rest and moving.
const BARS = [0.5, 0.85, 1, 0.75, 0.45];
// Bar heights in px: a dot as wide as the bar, up to the box.
const REST = 4;
const MAX = 20;

/**
 * Bars that move with whoever is talking; drawn per frame, not per signal.
 * Height, not scale, so the round ends stay round: dots at rest, pills when
 * loud. Five bars in a fixed box don't move anything else. While the agent
 * works, a slow wave runs through them, so the call doesn't look dead.
 */
function Meter(props: {
  who?: 'you' | 'voice';
  still: boolean;
  working: boolean;
}) {
  const bars: HTMLSpanElement[] = [];
  // Mirrored for the frame loop, which runs outside any tracking scope.
  let still = true;
  let working = false;
  createEffect(
    () => [props.still, props.working] as const,
    ([s, w]) => {
      still = s;
      working = w;
    },
  );
  onSettled(() => {
    // Eased towards the level, so bars glide instead of flicker.
    const shown = BARS.map(() => 0);
    let frame = requestAnimationFrame(function draw(time) {
      const loud = still ? 0 : Math.max(level('you'), level('voice'));
      bars.forEach((bar, i) => {
        // About one sweep a second, left to right.
        const wave = working
          ? 0.25 * (1 + Math.sin(time * 0.005 - i * 0.9)) * 0.5
          : 0;
        const target = Math.min(1, Math.max(loud * BARS[i]! * 1.8, wave));
        shown[i]! += (target - shown[i]!) * (target > shown[i]! ? 0.5 : 0.15);
        bar.style.height = `${REST + (MAX - REST) * shown[i]!}px`;
      });
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  });
  return (
    <span
      class={[
        'flex h-5 shrink-0 items-center gap-0.5 transition-colors duration-200',
        props.who === 'voice'
          ? 'text-accent'
          : props.who === 'you'
            ? 'text-running'
            : 'text-muted',
      ]}
      aria-hidden="true"
    >
      <For each={BARS}>
        {() => (
          <span
            ref={(el) => bars.push(el)}
            class="w-1 rounded-full bg-current"
            style={{ height: `${REST}px` }}
          />
        )}
      </For>
    </span>
  );
}

/**
 * What is being said, kept to its newest two lines: older ones slide off the
 * top, like a subtitle.
 */
function Caption(props: { text: string; voice: boolean }) {
  return (
    <div
      class={[
        'flex max-h-[2lh] min-w-0 flex-1 flex-col justify-end overflow-hidden text-read',
        props.voice ? 'text-fg' : 'text-muted',
      ]}
    >
      <p>
        <span class="sr-only">{props.voice ? 'Voice: ' : 'You: '}</span>
        {props.text}
      </p>
    </div>
  );
}

/**
 * Plays the hold music while the call's session works in silence, wherever
 * you are in the app: the call goes on when you leave its page, so the
 * music does too.
 */
export function HoldMusic() {
  const sessions = useSessions();
  const on = createMemo(
    () => {
      const c = call();
      if (!c || c.phase !== 'live' || c.talking || !soundOn()) return false;
      const status = sessions().find((s) => s.id === c.sessionId)?.status;
      return status === 'running' || status === 'retrying';
    },
    { name: 'holdMusicOn' },
  );
  createEffect(on, (on) => holdMusic(on));
  return null;
}

export default function CallBar(props: {
  id: string;
  busy: boolean;
  controls?: JSX.Element;
}) {
  return (
    <Show when={call()?.sessionId === props.id ? call() : undefined}>
      {(c) => {
        const state = () => {
          const now = c();
          if (now.phase === 'error') return now.error ?? 'Call failed';
          if (now.phase === 'connecting') return 'Connecting…';
          if (now.muted) return 'Muted';
          return props.busy ? 'Working on it…' : 'Listening';
        };
        const working = () =>
          props.busy && c().phase === 'live' && !c().talking;
        return (
          <div
            class="appear flex flex-col gap-1 rounded-sheet border border-line bg-surface pt-3.5 pr-2.5 pb-2.5 pl-4 shadow-raised"
            role="group"
            aria-label="Voice call"
          >
            <div class="flex min-h-8 items-center gap-3 py-1" role="status">
              <Meter
                who={c().talking}
                still={c().phase !== 'live' || c().muted}
                working={working()}
              />
              <Show
                when={c().caption}
                fallback={
                  <span
                    class={[
                      'text-read',
                      c().phase === 'error'
                        ? 'text-danger'
                        : props.busy && c().phase === 'live' && !c().muted
                          ? 'shimmer text-muted'
                          : 'text-muted',
                    ]}
                  >
                    {state()}
                  </span>
                }
              >
                {(caption) => (
                  <Caption text={caption()} voice={c().talking === 'voice'} />
                )}
              </Show>
            </div>
            <div class="-ml-1.5 flex items-center gap-0.5">
              {props.controls}
              <div class="ml-auto" />
              <Show when={c().phase === 'live'}>
                <IconButton
                  size="md"
                  round
                  title={c().muted ? 'Unmute' : 'Mute'}
                  aria-pressed={c().muted ? 'true' : 'false'}
                  class={c().muted ? 'bg-active text-danger' : undefined}
                  onClick={toggleMute}
                >
                  <Show when={c().muted} fallback={<MicIcon />}>
                    <MicOffIcon />
                  </Show>
                </IconButton>
              </Show>
              <IconButton
                class="ml-1 [&_svg]:size-3.5 [&_svg]:stroke-[2.25]"
                variant="danger"
                size="md"
                round
                title={c().phase === 'error' ? 'Close' : 'End call'}
                onClick={endCall}
              >
                <HangUpIcon />
              </IconButton>
            </div>
          </div>
        );
      }}
    </Show>
  );
}
