import { useNavigate } from '@solidjs/router';
import type { ConversationView, LiveState } from '@earendil-works/pi-durable';
import { Dynamic, type JSX } from '@solidjs/web';
import { For, Show, createMemo, createSignal } from 'solid-js';

import {
  MIN_CLEANUP,
  bloat,
  formatCost,
  formatTokens,
  type ContextUsage,
  type Item,
} from '#lib/context-usage';
import { tick } from '#lib/time';
import { CLEANUP_HINT } from '#lib/cleanup';
import {
  cleanupSession,
  compactSession,
  forkSession,
  setProfile,
} from '#lib/sessions';
import { PROFILES, type ProfileId } from '#lib/profiles';
import type { VoiceSettings as Voice } from '#lib/protocol';
import { paths } from '../router';
import ContextField, { percent } from './ContextField';
import { Breakdown } from './ui/Breakdown';
import { RollingNumber } from './ui/RollingNumber';
import VoiceSettings from './VoiceSettings';
import { openContextMenu } from './ui/ContextMenu';
import Alert from './ui/Alert';
import { Button, IconButton, buttonClass } from './ui/Button';
import Chevron from './ui/Chevron';
import Input from './ui/Input';
import Summary from './ui/Summary';
import {
  AssistantIcon,
  CleanUpIcon,
  CodeIcon,
  HubIcon,
  CloseIcon,
  ColdIcon,
  CompactIcon,
  ExpiringIcon,
  ForkIcon,
  InfoIcon,
  VoiceIcon,
} from './ui/icons';

const LONG_LIVED_HINT =
  'While it sits idle, Tau clears old tool output once the cache is cold, and past 120k it has the agent save memories to files, then compacts. Past 200k it does that at the first pause.';

const PROFILE_ICON: Record<ProfileId, () => JSX.Element> = {
  coding: CodeIcon,
  assistant: AssistantIcon,
  hub: HubIcon,
};

/** The context chip in the session's top bar: fork, compact, or the breakdown. */
export default function ContextMeter(props: {
  id: string;
  view: ConversationView;
  usage: ContextUsage;
  profile: ProfileId;
  voice: Voice | null;
}) {
  let voiceDialog: HTMLDialogElement | undefined;
  const usage = () => props.usage;
  const running = () =>
    !!(props.view.docs['pi.live'] as LiveState | undefined)?.run;

  const cacheLeft = () => {
    const c = usage().cache;
    return c ? c.at + c.ttl - tick() : undefined;
  };
  // An hour is long; the chip only speaks up near the end.
  const expiring = () => {
    const l = cacheLeft();
    return l !== undefined && l > 0 && l < EXPIRING;
  };
  const cold = () => (cacheLeft() ?? 1) <= 0;
  const spent = () => usage().spend.reduce((n, s) => n + s.cost, 0);

  let dialog: HTMLDialogElement | undefined;
  const navigate = useNavigate();
  const menu = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openContextMenu(r.right - 200, r.bottom + 4, [
      {
        label: 'Fork from here',
        icon: <ForkIcon />,
        onSelect: () =>
          void forkSession(props.id).then((id) => navigate(paths.s(id)())),
      },
      {
        label: usage().compacting ? 'Compacting…' : 'Compact now',
        icon: <CompactIcon />,
        disabled: usage().compacting && 'Already compacting',
        onSelect: () => void compactSession(props.id),
      },
      {
        label: 'Clean up old output',
        hint: CLEANUP_HINT,
        icon: <CleanUpIcon />,
        disabled: running()
          ? 'Wait for the agent to finish'
          : usage().cleanable < MIN_CLEANUP && 'Nothing old to clean up',
        onSelect: () => void cleanupSession(props.id),
      },
      ...(Object.keys(PROFILES) as ProfileId[])
        .filter((p) => p !== props.profile)
        .map((p) => {
          const Icon = PROFILE_ICON[p];
          return {
            label: `Switch to ${PROFILES[p].label}`,
            hint: `${PROFILES[p].about}.${PROFILES[p].longLived ? ` ${LONG_LIVED_HINT}` : ''} Rebuilds the prompt cache once.`,
            icon: <Icon />,
            onSelect: () => void setProfile(props.id, p),
          };
        }),
      {
        label: 'Voice settings',
        icon: <VoiceIcon />,
        onSelect: () => voiceDialog?.showModal(),
      },
      'separator',
      {
        label: spent()
          ? `Context and cost · ${formatCost(spent())}`
          : 'Context details',
        icon: <InfoIcon />,
        onSelect: () => dialog?.showModal(),
      },
    ]);
  };

  return (
    <>
      <button
        type="button"
        class={[
          buttonClass({ size: 'md' }),
          'tabular-nums',
          // Important: the ghost button's own text-muted sorts after
          // text-danger and would win.
          tone(usage()) === 'danger' && 'text-danger!',
          tone(usage()) === 'warn' && 'text-warn-ink!',
          // Past 500k it won't sit still.
          bloat(usage().used) >= 4 && 'motion-safe:animate-nudge',
        ]}
        title={chipTitle(usage(), running(), cacheLeft(), spent())}
        aria-haspopup="menu"
        onClick={menu}
      >
        <Show when={props.profile !== 'coding'}>
          <span
            class="text-muted"
            title={`${PROFILES[props.profile].label}: ${PROFILES[props.profile].about}. ${LONG_LIVED_HINT}`}
          >
            <Dynamic component={PROFILE_ICON[props.profile]} />
          </span>
        </Show>
        <Ring usage={usage()} />
        <RollingNumber value={usage().used} format={formatTokens} />
        <Show when={!running() && expiring()}>
          <span
            class="flex items-center gap-1 text-warn"
            title={`Prompt cache expires in ${clock(cacheLeft()!)}. A message sent before then rereads the context from cache, cheaper and faster.`}
          >
            <ExpiringIcon />
            {Math.max(1, Math.ceil(cacheLeft()! / 60_000))}m
          </span>
        </Show>
        <Show when={!running() && cold()}>
          <span
            class="text-muted"
            title={`Prompt cache expired. The next message rewrites ~${formatTokens(usage().used)} to the cache.`}
          >
            <ColdIcon />
          </span>
        </Show>
      </button>
      <dialog
        ref={(el) => (dialog = el)}
        class="mx-0 mt-auto mb-0 flex max-h-[85dvh] w-full max-w-none flex-col overflow-hidden rounded-t-sheet border border-line bg-panel text-fg shadow-sheet backdrop:bg-black/40 not-open:hidden max-md:sheet md:pop md:m-auto md:max-h-[min(44rem,85dvh)] md:w-[32rem] md:rounded-card"
        aria-label="Context"
        onClick={(e) => e.target === e.currentTarget && dialog?.close()}
      >
        <header class="flex h-12 shrink-0 items-center gap-1 border-b border-line pr-2 pl-4">
          <h2 class="flex-1 font-semibold">Context</h2>
          <IconButton title="Close" onClick={() => dialog?.close()}>
            <CloseIcon />
          </IconButton>
        </header>
        <div class="flex flex-col divide-y divide-line overflow-y-auto overscroll-contain px-4 pb-[env(safe-area-inset-bottom)] *:py-4">
          <ContextField id={props.id} usage={usage()} running={running()} />
          <Biggest
            items={usage().biggest}
            onJump={(target) => {
              dialog?.close();
              jump(target);
            }}
          />
          <Cache usage={usage()} running={running()} left={cacheLeft()} />
          <Compact id={props.id} usage={usage()} />
        </div>
      </dialog>
      <VoiceSettings
        id={props.id}
        voice={props.voice}
        ref={(el) => (voiceDialog = el)}
      />
    </>
  );
}

function Heading(props: { children: JSX.Element }) {
  return (
    <h3 class="text-meta font-medium tracking-wide text-muted uppercase">
      {props.children}
    </h3>
  );
}

function tone(u: ContextUsage) {
  const share = u.window ? u.used / u.window : 0;
  const level = bloat(u.used);
  return share >= 0.9 || level >= 3
    ? 'danger'
    : share >= 0.7 || level >= 1
      ? 'warn'
      : undefined;
}

// Below this the chip shows how long the prompt cache has left.
const EXPIRING = 10 * 60_000;

function chipTitle(
  u: ContextUsage,
  running: boolean,
  left: number | undefined,
  spent: number,
) {
  const size = u.window
    ? `${formatTokens(u.used)} of ${formatTokens(u.window)} tokens (${percent(u.used, u.window)})`
    : `${formatTokens(u.used)} tokens`;
  const cost = spent ? `. Spent ${formatCost(spent)}` : '';
  if (running || left === undefined) return `Context: ${size}${cost}`;
  return `Context: ${size}. Prompt cache ${left > 0 ? `warm for ${clock(left)}` : 'cold'}${cost}`;
}

function Ring(props: { usage: ContextUsage }) {
  const share = () =>
    props.usage.window ? Math.min(1, props.usage.used / props.usage.window) : 0;
  const C = 2 * Math.PI * 6;
  return (
    <svg
      class="size-4 shrink-0 -rotate-90"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        opacity="0.2"
      />
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray={`${share() * C} ${C}`}
      />
    </svg>
  );
}

function Biggest(props: {
  items: Item[];
  onJump: (target: Item['target']) => void;
}) {
  return (
    <Show when={props.items.length}>
      <section class="flex flex-col gap-1">
        <Heading>Biggest</Heading>
        <div class="-mx-1.5 flex flex-col">
          <For each={props.items} keyed={(i) => JSON.stringify(i.target)}>
            {(item) => (
              <button
                type="button"
                class="flex h-8 items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-hover touch:h-11"
                onClick={() => props.onJump(item().target)}
              >
                <span class="max-w-24 shrink-0 truncate text-muted">
                  {item().label}
                </span>
                <span class="min-w-0 flex-1 truncate font-mono text-meta">
                  {item().detail}
                </span>
                <span class="tabular-nums">{formatTokens(item().tokens)}</span>
              </button>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}

function Cache(props: {
  usage: ContextUsage;
  running: boolean;
  left: number | undefined;
}) {
  const totals = createMemo(() => {
    const t = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: 0 };
    for (const s of props.usage.spend) {
      t.input += s.input;
      t.cacheRead += s.cacheRead;
      t.cacheWrite += s.cacheWrite;
      t.output += s.output;
      t.cost += s.cost;
    }
    return t;
  });
  const sent = () => totals().input + totals().cacheRead + totals().cacheWrite;
  const [measure, setMeasure] = createSignal<'cost' | 'tokens'>('cost', {
    name: 'spendMeasure',
  });
  const cold = () =>
    !props.running && props.left !== undefined && props.left <= 0;

  return (
    <Show when={props.usage.spend.length}>
      <section class="flex flex-col gap-2.5">
        <Heading>Cache and spend</Heading>
        <dl class="grid grid-cols-4 gap-2">
          <Stat
            label="Cache"
            value={
              props.running
                ? 'In use'
                : props.left === undefined
                  ? '—'
                  : props.left > 0
                    ? `Warm ${clock(props.left)}`
                    : 'Cold'
            }
            tone={cold() ? 'warn' : undefined}
          />
          <Stat
            label="Hit rate"
            value={sent() ? percent(totals().cacheRead, sent()) : '—'}
          />
          <Stat label="Misses" value={String(props.usage.misses)} />
          <Stat label="Spent" value={formatCost(totals().cost)} />
        </dl>
        <Show when={cold()}>
          <p class="text-meta text-muted">
            Next turn rewrites ~{formatTokens(props.usage.used)} to the cache.
          </p>
        </Show>
        <Breakdown
          title="By model"
          items={props.usage.spend.map((m) => ({
            id: m.model,
            label: m.model.split('/').pop()!,
            value:
              measure() === 'cost'
                ? m.cost
                : m.input + m.cacheRead + m.cacheWrite + m.output,
          }))}
          format={measure() === 'cost' ? formatCost : formatTokens}
          totalLabel={
            measure() === 'cost'
              ? 'Spent, at API prices'
              : 'Tokens sent and received'
          }
          options={[
            { id: 'cost', label: 'Cost' },
            { id: 'tokens', label: 'Tokens' },
          ]}
          option={measure()}
          onOption={(id) => setMeasure(id as 'cost' | 'tokens')}
          footer="Priced at API rates, also with a subscription. Subagents not included."
        />
        <details class="group/row -mx-1.5">
          <Summary class="text-meta">
            <span class="flex-1">Tokens by kind</span>
            <Chevron class="group-open/row:rotate-90" />
          </Summary>
          <div class="px-1.5">
            <table class="w-full text-meta tabular-nums">
              <thead class="text-muted">
                <tr>
                  <th class="py-1 text-left font-normal">Model</th>
                  <th class="py-1 text-right font-normal">Read</th>
                  <th class="py-1 text-right font-normal">Write</th>
                  <th class="py-1 text-right font-normal">New</th>
                  <th class="py-1 text-right font-normal">Out</th>
                  <th class="py-1 text-right font-normal">Cost</th>
                </tr>
              </thead>
              <tbody>
                <For each={props.usage.spend} keyed={(s) => s.model}>
                  {(s) => (
                    <tr class="border-t border-line">
                      <td class="max-w-24 truncate py-1.5">
                        {s().model.split('/').pop()}
                      </td>
                      <td class="py-1.5 text-right">
                        {formatTokens(s().cacheRead)}
                      </td>
                      <td class="py-1.5 text-right">
                        {formatTokens(s().cacheWrite)}
                      </td>
                      <td class="py-1.5 text-right">
                        {formatTokens(s().input)}
                      </td>
                      <td class="py-1.5 text-right">
                        {formatTokens(s().output)}
                      </td>
                      <td class="py-1.5 text-right">{formatCost(s().cost)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </Show>
  );
}

function Stat(props: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div class="flex min-w-0 flex-col">
      <dt class="text-meta text-muted">{props.label}</dt>
      <dd
        class={[
          'truncate font-medium tabular-nums',
          props.tone === 'warn' && 'text-warn',
        ]}
      >
        {props.value}
      </dd>
    </div>
  );
}

function Compact(props: { id: string; usage: ContextUsage }) {
  const [busy, setBusy] = createSignal(false, { name: 'compactBusy' });
  const [error, setError] = createSignal('', { name: 'compactError' });
  let focus!: HTMLInputElement;
  return (
    <section class="flex flex-col gap-2">
      <Heading>Compact</Heading>
      <form
        class="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await compactSession(props.id, focus.value);
            focus.value = '';
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          ref={(el) => (focus = el)}
          class="h-8 min-w-0 flex-1 touch:h-11"
          placeholder="What to keep (optional)"
        />
        <Button
          type="submit"
          variant="outline"
          loading={busy() || props.usage.compacting}
        >
          Compact
        </Button>
      </form>
      <Show when={error()}>
        <Alert>{error()}</Alert>
      </Show>
      <p class="text-meta text-muted">
        Summarizes older turns, keeps the last ~20k as is. The agent can keep
        working.
      </p>
    </section>
  );
}

/** Scrolls the transcript to a row and opens it. */
function jump(target: Item['target']) {
  const el =
    'call' in target
      ? document.querySelector(`[data-call="${CSS.escape(target.call)}"]`)
      : document.querySelector(`[data-key="${CSS.escape(target.key)}"]`);
  if (!(el instanceof HTMLElement)) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ block: 'center' });
  el.animate(
    [
      { boxShadow: '0 0 0 2px var(--color-accent)' },
      { boxShadow: '0 0 0 2px transparent' },
    ],
    { duration: 1600, easing: 'ease-out' },
  );
}

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return s >= 3600
    ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
