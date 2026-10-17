import {
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
} from 'solid-js';

import {
  BLOATED,
  bloat,
  formatTokens,
  type ContextUsage,
} from '#lib/context-usage';
import { CLEANUP_HINT } from '#lib/cleanup';
import { cleanupSession, compactSession, isCleaning } from '#lib/sessions';
import { cheer } from '#lib/sound';
import { tick } from '#lib/time';
import type { Message } from '#lib/transcript';
import { Button, IconButton } from './ui/Button';
import { toast } from './ui/Toast';
import { CleanUpIcon, CloseIcon, CompactIcon } from './ui/icons';

type Compaction = Extract<Message, { kind: 'compaction' }>;
type Cleanup = Extract<Message, { kind: 'cleanup' }>;

// Below this, resending the whole context costs little.
const COLD_WORTH_IT = 30_000;
// Below this, Clean up saves too little to offer on its own.
const CLEAN_WORTH_IT = 5_000;
// Past this share of the auto-compaction point, say it is coming.
const NEAR_AUTO = 0.85;
// The cache's last minutes: the cheapest moment to compact.
const EXPIRING = 10 * 60_000;

/**
 * Which hint shows, and the key that dismissing it remembers: a dismissed
 * hint returns when its key changes (the next 100k, the next cold cache).
 */
type Hint = {
  kind: 'cold' | 'big' | 'auto';
  key: string;
  // Cold: which actions are worth it.
  clean?: boolean;
  compact?: boolean;
  // Big: the cache's last minutes.
  left?: number;
};

// Per session, until the key changes.
const dismissed = new Map<string, string>();

/**
 * Above the composer, one calm line about the context when there is
 * something worth doing: Clean up once the cache is cold, Compact while it is
 * warm and the session is big. Cheers when it shrinks.
 */
const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e));

export default function ContextNag(props: {
  id: string;
  usage: ContextUsage;
  compaction: Compaction | undefined;
  cleanup: Cleanup | undefined;
}) {
  // The map isn't reactive; the signal says it changed.
  const [dismissals, setDismissals] = createSignal(0, { name: 'nagDismiss' });
  const [compacting, setCompacting] = createSignal(false, {
    name: 'nagCompacting',
  });
  const cleaning = () => isCleaning(props.id);

  // Only what lands while watching: not what was already there on open.
  let seen: { id: string; key?: string } | undefined;
  let seenCleanup: { id: string; key?: string } | undefined;
  createEffect(
    () => ({ id: props.id, c: props.compaction }),
    ({ id, c }) => {
      const prev = seen;
      seen = { id, key: c?.key };
      if (!c || !prev || prev.id !== id || prev.key === c.key) return;
      cheer();
    },
    { name: 'nagCompacted' },
  );
  createEffect(
    () => ({ id: props.id, c: props.cleanup }),
    ({ id, c }) => {
      const prev = seenCleanup;
      seenCleanup = { id, key: c?.key };
      if (!c || !prev || prev.id !== id || prev.key === c.key) return;
      cheer();
    },
    { name: 'nagSwept' },
  );

  const hint = createMemo<Hint | undefined>(
    () => {
      const u = props.usage;
      if (u.running || u.compacting) return;
      const c = u.cache;
      const left = c ? c.at + c.ttl - tick() : undefined;
      const big = u.used >= BLOATED;
      if (left !== undefined && left <= 0) {
        if (u.used < COLD_WORTH_IT) return;
        const clean = u.cleanable >= CLEAN_WORTH_IT;
        // Compacting a cold session rereads all of it first: only worth it
        // when even a clean session would stay big.
        const compact = u.used - (clean ? u.cleanable : 0) >= BLOATED;
        if (!clean && !compact) return;
        return {
          kind: 'cold',
          key: `cold:${c!.at}`,
          clean,
          compact,
        };
      }
      if (big) {
        return {
          kind: 'big',
          key: `big:${bloat(u.used)}`,
          left: left !== undefined && left < EXPIRING ? left : undefined,
        };
      }
      if (u.compactAt && u.used >= u.compactAt * NEAR_AUTO)
        return { kind: 'auto', key: 'auto' };
    },
    { name: 'nagHint' },
  );
  const shown = () => {
    dismissals();
    const h = hint();
    return !cleaning() && h && dismissed.get(props.id) !== h.key
      ? h
      : undefined;
  };
  const dismiss = () => {
    const h = hint();
    if (!h) return;
    dismissed.set(props.id, h.key);
    setDismissals((n) => n + 1);
  };

  const compact = () => {
    setCompacting(true);
    void compactSession(props.id)
      .catch(fail)
      .finally(() => setCompacting(false));
  };
  const cleanUp = () => void cleanupSession(props.id).catch(fail);

  const CompactButton = (p: { primary: boolean }) => (
    <Button
      size="sm"
      variant={p.primary ? 'primary' : 'outline'}
      loading={compacting()}
      disabled={compacting() || cleaning()}
      title="Summarizes older turns. The last ~20k stay as they are."
      onClick={compact}
    >
      <CompactIcon />
      Compact
    </Button>
  );

  return (
    <div>
      <Show when={shown()}>
        {(h) => (
          <div
            class={[
              'appear mb-1 flex min-h-8 items-center gap-2 py-0.5 pr-0.5 pl-2.5 text-ui',
            ]}
          >
            <span class="flex min-w-0 flex-1 items-center">
              <span class="min-w-0 py-1 text-pretty">
                <Text hint={h()} usage={props.usage} />
              </span>
            </span>
            <span class="flex shrink-0 items-center gap-1">
              <Show when={h().kind === 'cold'}>
                <Show when={h().compact}>
                  <CompactButton primary={!h().clean} />
                </Show>
                <Show when={h().clean}>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={compacting()}
                    title={CLEANUP_HINT}
                    onClick={cleanUp}
                  >
                    <CleanUpIcon />
                    <span class="tabular-nums">
                      Clean up −{formatTokens(props.usage.cleanable)}
                    </span>
                  </Button>
                </Show>
              </Show>
              <Show when={h().kind !== 'cold'}>
                <CompactButton primary />
              </Show>
              <IconButton size="sm" title="Not now" onClick={dismiss}>
                <CloseIcon />
              </IconButton>
            </span>
          </div>
        )}
      </Show>
    </div>
  );
}

function Text(props: { hint: Hint; usage: ContextUsage }) {
  const used = () => formatTokens(props.usage.used);
  return (
    <Switch>
      <Match when={props.hint.kind === 'cold'}>
        Cache expired: your next message resends all {used()}.
      </Match>
      <Match when={props.hint.kind === 'auto'}>
        Compacts on its own at {formatTokens(props.usage.compactAt ?? 0)}.
      </Match>
      <Match when={props.hint.left}>
        {(left) => (
          <>
            Cache expires in {Math.max(1, Math.ceil(left() / 60_000))}m, the
            cheapest moment to compact.
          </>
        )}
      </Match>
      <Match when>{used()} in context: compacting keeps replies quick.</Match>
    </Switch>
  );
}
