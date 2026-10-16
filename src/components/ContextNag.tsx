import { Show, createEffect, createSignal } from 'solid-js';

import {
  MIN_CLEANUP,
  bloat,
  formatTokens,
  type ContextUsage,
} from '#lib/context-usage';
import { confetti } from '#lib/confetti';
import { reducedMotion } from '#lib/motion';
import { CLEANUP_HINT } from '#lib/cleanup';
import { cleanupSession, compactSession } from '#lib/sessions';
import { cheer } from '#lib/sound';
import { tick } from '#lib/time';
import type { Message } from '#lib/transcript';
import { Button } from './ui/Button';
import { RollingNumber } from './ui/RollingNumber';
import { CleanUpIcon, CompactIcon } from './ui/icons';

type Compaction = Extract<Message, { kind: 'compaction' }>;

// Gets worse with every 100k past 200k.
const QUIPS: string[][] = [
  [],
  [
    '🥧 This pie is getting big.',
    '🥧 A hearty slice of context.',
    '🥧 Someone’s been eating well.',
  ],
  [
    '🥧🥧 That’s a lot of pie.',
    '🥧🥧 The model rereads all of this every turn.',
    '🥧🥧 Tokens everywhere.',
  ],
  [
    '🥧🥧🥧 Please. Compact.',
    '🥧🥧🥧 Your agent is wading through a novel.',
    '🥧🥧🥧 It’s starting to forget the beginning.',
  ],
  [
    '🚨 Pie overload.',
    '🚨 This session has its own gravity.',
    '🚨 Okay, I’m begging now.',
  ],
];

const BRAGS = [
  '🎉 Lighter already.',
  '🎉 Fresh pie.',
  '🎉 Much better.',
  '🎉 The agent thanks you.',
];

// Below this, resending the whole context costs little.
const COLD_WORTH_IT = 30_000;

// "Later" per session, until the next level.
const snoozed = new Map<string, number>();

const pick = <T,>(list: T[], seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return list[Math.abs(h) % list.length]!;
};

/**
 * Above the composer: nags to compact once a session passes 200k, louder with
 * every 100k, and cheers when it shrinks.
 */
export default function ContextNag(props: {
  id: string;
  usage: ContextUsage;
  compaction: Compaction | undefined;
}) {
  const level = () => bloat(props.usage.used);
  // The map isn't reactive; the signal says it changed.
  const [snoozes, setSnoozes] = createSignal(0, { name: 'nagSnoozes' });
  const snooze = () => (snoozes(), snoozed.get(props.id) ?? 0);
  const [reward, setReward] = createSignal<
    { text: string; lost?: number; after: number } | undefined
  >(undefined, { name: 'nagReward' });
  const [busy, setBusy] = createSignal(false, { name: 'nagBusy' });
  let strip: HTMLDivElement | undefined;

  // Only a compaction that lands while watching: not one already there on open.
  let seen: { id: string; key?: string } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    () => ({ id: props.id, c: props.compaction }),
    ({ id, c }) => {
      const prev = seen;
      seen = { id, key: c?.key };
      if (!c || !prev || prev.id !== id || prev.key === c.key) return;
      clearTimeout(timer);
      setReward({
        text: pick(BRAGS, c.key),
        lost: c.before && c.before - c.after,
        after: c.after,
      });
      timer = setTimeout(() => setReward(undefined), 6000);
      cheer();
      queueMicrotask(() => strip && confetti(strip));
    },
    { name: 'nagReward' },
  );

  // A wiggle each time it gets worse.
  createEffect(
    () => level(),
    (l, prev) => {
      if (l > (prev ?? 0) && strip && !reducedMotion())
        strip.animate(
          [
            { rotate: '0deg' },
            { rotate: '-1.5deg' },
            { rotate: '1.5deg' },
            { rotate: '-1deg' },
            { rotate: '0deg' },
          ],
          { duration: 400, easing: 'ease-in-out' },
        );
    },
    { name: 'nagWiggle' },
  );

  // The provider dropped its cached copy: the next message pays full price
  // for everything, so this is the moment to clean up.
  const cold = () => {
    const c = props.usage.cache;
    return (
      !!c &&
      !props.usage.running &&
      !props.usage.compacting &&
      props.usage.used >= COLD_WORTH_IT &&
      c.at + c.ttl <= tick()
    );
  };
  const cleanUp = () => {
    const { used, cleanable } = props.usage;
    setBusy(true);
    void cleanupSession(props.id)
      .then(() => {
        clearTimeout(timer);
        setReward({
          text: '🧹 Swept.',
          lost: cleanable,
          after: used - cleanable,
        });
        timer = setTimeout(() => setReward(undefined), 6000);
        cheer();
      })
      .finally(() => setBusy(false));
  };

  const nagging = () =>
    !reward() && !cold() && !props.usage.compacting && level() > snooze();

  return (
    <div ref={(el) => (strip = el)}>
      <Show when={reward()}>
        {(r) => (
          <div class="appear mb-1 flex min-h-8 items-center gap-2 rounded-lg bg-running/12 px-2.5 py-1 text-ui">
            <span class="min-w-0 flex-1">{r().text}</span>
            <span class="shrink-0 text-meta text-muted tabular-nums">
              <Show
                when={r().lost && r().lost! > 0}
                fallback={`Now ~${formatTokens(r().after)}`}
              >
                −{formatTokens(r().lost!)} · now ~{formatTokens(r().after)}
              </Show>
            </span>
          </div>
        )}
      </Show>
      <Show when={!reward() && cold()}>
        <div class="appear mb-1 flex min-h-8 items-center gap-2 rounded-lg bg-warn/12 py-0.5 pr-0.5 pl-2.5 text-ui">
          <span class="min-w-0 flex-1">
            Prompt cache expired. The next message resends ~
            {formatTokens(props.usage.used)} tokens.
          </span>
          <Show when={props.usage.cleanable >= MIN_CLEANUP}>
            <Button
              size="sm"
              variant="primary"
              loading={busy()}
              title={CLEANUP_HINT}
              onClick={cleanUp}
            >
              <CleanUpIcon />
              Clean up
            </Button>
          </Show>
        </div>
      </Show>
      <Show when={nagging()}>
        <div
          class={[
            'appear mb-1 flex min-h-8 items-center gap-2 rounded-lg py-0.5 pr-0.5 pl-2.5 text-ui',
            level() >= 3 ? 'bg-danger/12' : 'bg-warn/12',
          ]}
        >
          <span class="min-w-0 flex-1">
            {pick(QUIPS[level()]!, `${props.id}:${level()}`)}
          </span>
          <span
            class={[
              'shrink-0 text-meta font-medium tabular-nums',
              level() >= 3 ? 'text-danger' : 'text-warn',
            ]}
          >
            <RollingNumber value={props.usage.used} format={formatTokens} />
          </span>
          <Button
            size="sm"
            onClick={() => {
              snoozed.set(props.id, level());
              setSnoozes((n) => n + 1);
            }}
          >
            Later
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={busy()}
            onClick={() => {
              setBusy(true);
              void compactSession(props.id).finally(() => setBusy(false));
            }}
          >
            <CompactIcon />
            Compact
          </Button>
        </div>
      </Show>
    </div>
  );
}
