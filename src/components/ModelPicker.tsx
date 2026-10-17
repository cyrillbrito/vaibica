import { For, Repeat, Show, createMemo, createSignal } from 'solid-js';

import { formatTokens } from '#lib/context-usage';
import { modelKey, pickable, useModels } from '#lib/models';
import type { ModelCatalog, ModelChoice, ThinkingLevel } from '#lib/protocol';
import { buttonClass } from './ui/Button';
import Chevron from './ui/Chevron';
import { CheckIcon, ThoughtIcon } from './ui/icons';
import Input from './ui/Input';
import { RollingNumber } from './ui/RollingNumber';
import { Segmented, segmentClass } from './ui/Segmented';
import { Switch } from './ui/Switch';

type Model = ModelCatalog['models'][number] & { decision?: boolean };

// A decision model in the picker's shape: no thinking, no output price.
const asModel = (m: ModelCatalog['classifiers'][number]): Model => ({
  ...m,
  levels: [],
  images: false,
  cost: { input: m.cost.input, output: 0, cacheRead: 0 },
  cacheTtl: {},
  decision: true,
});

// Five steps each, from pi-ai's real numbers: there are no speed or quality
// scores to show, so the bars are the window and the price.
const CONTEXT_STEPS = [32_000, 128_000, 256_000, 512_000];
const PRICE_STEPS = [0.5, 2, 6, 15];
const step = (n: number, steps: number[]) =>
  steps.filter((s) => n > s).length + 1;
// Most of a coding agent's tokens are input: weigh it three to one.
const blended = (m: Model) => (3 * m.cost.input + m.cost.output) / 4;
const contextLevel = (m: Model) => step(m.contextWindow, CONTEXT_STEPS);
const priceLevel = (m: Model) =>
  m.cost.input || m.cost.output ? step(blended(m), PRICE_STEPS) : 0;

const dollars = (n: number) =>
  `$${n >= 10 ? Math.round(n) : n.toFixed(2).replace(/\.?0+$/, '')}`;

const EFFORT: Record<ThinkingLevel, [short: string, long: string]> = {
  off: ['Off', 'No thinking'],
  minimal: ['Min', 'Minimal'],
  low: ['Low', 'Low'],
  medium: ['Med', 'Medium'],
  high: ['High', 'High'],
  xhigh: ['XHigh', 'Extra high'],
  max: ['Max', 'Max'],
};

let nextId = 0;

/** `want` when the model has it, else its nearest level. */
function levelFor(m: Model, want: ThinkingLevel): ThinkingLevel {
  if (!m.levels.length || m.levels.includes(want)) return want;
  const order = Object.keys(EFFORT) as ThinkingLevel[];
  const at = order.indexOf(want);
  return [...m.levels].sort(
    (a, b) => Math.abs(order.indexOf(a) - at) - Math.abs(order.indexOf(b) - at),
  )[0]!;
}

const describe = (m: Model) =>
  [
    m.decision && 'decision model',
    `${formatTokens(m.contextWindow)} context`,
    m.images && 'images',
    !m.decision && !m.levels.filter((l) => l !== 'off').length && 'no thinking',
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Five segments; pointing at the row fills them one after another. From
 * the keyboard they fill at once.
 */
function Bars(props: {
  level: number;
  lit: boolean;
  column: number;
  instant: boolean;
}) {
  return (
    <span class="grid w-10 shrink-0 grid-cols-5 gap-0.5" aria-hidden="true">
      <Repeat count={5}>
        {(i) => (
          <span
            class={[
              'h-1.5 rounded-cell',
              !props.instant && 'transition-colors duration-200',
              i >= props.level
                ? 'bg-active'
                : props.lit
                  ? 'bg-fg'
                  : 'bg-line-strong',
            ]}
            style={{
              'transition-delay':
                props.lit && !props.instant
                  ? `${props.column * 40 + i * 25}ms`
                  : '0ms',
            }}
          />
        )}
      </Repeat>
    </span>
  );
}

/**
 * One chip for model and effort; opens a popover above it (a bottom sheet on
 * phones). Hidden while `value` is undefined (no model set yet), unless
 * `empty` gives the chip a label for that state. `effort={false}` picks a
 * model only.
 */
export default function ModelPicker(props: {
  value: ModelChoice | undefined;
  onChange: (choice: ModelChoice) => void;
  empty?: string;
  effort?: boolean;
  // Name the provider on the chip: the same model can come through several.
  provider?: boolean;
  // Offer decision models first, then chat models that can stand in.
  decision?: boolean;
}) {
  const id = `model-picker-${++nextId}`;
  let popover: HTMLDivElement | undefined;
  const catalog = useModels();
  const options = createMemo<Model[]>(
    () => [
      // Absent from a server that predates decision models.
      ...(props.decision ? (catalog().classifiers ?? []).map(asModel) : []),
      ...pickable(catalog(), props.value),
    ],
    {
      name: 'modelOptions',
    },
  );
  const [query, setQuery] = createSignal('', { name: 'modelQuery' });
  const groups = createMemo(
    () => {
      const words = query().toLowerCase().split(/\s+/).filter(Boolean);
      const byProvider = new Map<string, Model[]>();
      for (const m of options().filter((m) =>
        words.every((w) => `${m.name} ${m.id}`.toLowerCase().includes(w)),
      )) {
        const key = `${m.decision ? 'decision:' : ''}${m.provider}`;
        byProvider.set(key, [...(byProvider.get(key) ?? []), m]);
      }
      return [...byProvider].map(([id, models]) => {
        const provider = models[0]!.provider;
        const name =
          catalog().providers.find((p) => p.id === provider)?.name ?? provider;
        return {
          id,
          name: models[0]!.decision ? `Decision models · ${name}` : name,
          models,
        };
      });
    },
    { name: 'modelGroups' },
  );
  const current = createMemo(
    () => {
      const v = props.value;
      return v
        ? options().find(
            (m) => m.provider === v.model.provider && m.id === v.model.modelId,
          )
        : undefined;
    },
    { name: 'currentModel' },
  );
  const thinks = () => props.effort !== false && !!current()?.levels.length;
  const [pointed, setPointed] = createSignal<string | null>(null, {
    name: 'modelPointed',
  });
  const [byKey, setByKey] = createSignal(false, { name: 'modelPointedByKey' });
  // The tray speaks for the model you point at, else the picked one.
  const shown = () =>
    options().find((m) => modelKey(m.provider, m.id) === pointed()) ??
    current();
  const effortOn = () => thinks() && !!current();
  // Models that can stop thinking get a switch; effort unfolds under it.
  const canSwitch = () =>
    !!current()?.levels.includes('off') && current()!.levels.length > 1;
  const thinking = () => props.value?.thinkingLevel !== 'off';
  const efforts = () => current()?.levels.filter((l) => l !== 'off') ?? [];
  // The effort to come back to when thinking is switched on again.
  let lastEffort: ThinkingLevel = 'medium';

  return (
    <Show when={(props.value || props.empty) && options().length}>
      <button
        type="button"
        popovertarget={id}
        class={[buttonClass({ size: 'md' }), 'min-w-0']}
        style={{ 'anchor-name': `--${id}` }}
        title={
          props.value &&
          `${modelKey(props.value.model.provider, props.value.model.modelId)}${
            thinks() ? ` · ${EFFORT[props.value.thinkingLevel][1]}` : ''
          }`
        }
      >
        <Show when={props.provider && props.value}>
          <span class="shrink-0 text-muted">
            {catalog().providers.find(
              (p) => p.id === props.value!.model.provider,
            )?.name ?? props.value!.model.provider}
          </span>
        </Show>
        <span class={['truncate', !props.value && 'text-muted']}>
          {props.value
            ? (current()?.name ?? props.value.model.modelId)
            : props.empty}
        </span>
        <Show when={thinks()}>
          <span class="shrink-0 text-muted/70">
            {EFFORT[props.value!.thinkingLevel][0]}
          </span>
        </Show>
        <Chevron class="-rotate-90 text-muted/70" />
      </button>
      <div
        ref={(el) => (popover = el)}
        id={id}
        popover="auto"
        aria-label="Model and effort"
        style={{ '--anchor': `--${id}` }}
        onToggle={(e) => e.newState !== 'open' && setPointed(null)}
        class={[
          'm-0 flex-col overflow-hidden bg-panel p-1 text-fg shadow-menu open:flex max-md:sheet max-md:shadow-sheet md:pop md:origin-bottom-left',
          // Phone: a sheet from the bottom, reachable with the thumb.
          'inset-x-0 top-auto bottom-0 w-full max-w-none rounded-t-tray pb-[env(safe-area-inset-bottom)] backdrop:bg-black/40',
          // Wider: floats above the chip, flips below when there's no room.
          'md:inset-auto md:mb-1 md:w-80 md:rounded-tray md:pb-1 md:backdrop:bg-transparent md:[position-anchor:var(--anchor)] md:[position-area:top_span-right] md:[position-try-fallbacks:flip-block]',
        ]}
      >
        <div class="flex min-h-0 flex-col overflow-hidden rounded-sheet border border-line bg-surface">
          <Show when={options().length > 12}>
            <div class="border-b border-line p-1.5">
              <Input
                class="h-8 w-full touch:h-11"
                type="search"
                placeholder="Search models…"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
          </Show>
          <div
            class="flex items-center gap-2.5 px-3 pt-1.5 text-meta text-muted"
            aria-hidden="true"
          >
            <span class="flex-1">Model</span>
            <span class="w-10 text-center">Context</span>
            <span class="w-10 text-center">Price</span>
          </div>
          <div
            class="flex max-h-[50dvh] flex-col overflow-y-auto overscroll-contain p-1 md:max-h-80"
            data-pointing={pointed() ? '' : undefined}
            onPointerLeave={() => setPointed(null)}
          >
            <Show when={!groups().length}>
              <p class="px-2.5 py-3 text-meta text-muted">No model matches.</p>
            </Show>
            <For each={groups()} keyed={(g) => g.id}>
              {(g) => (
                <>
                  {/* Labels only help when there is more than one provider. */}
                  <Show when={groups().length > 1}>
                    <div class="px-2.5 pt-2 pb-1 text-meta text-muted">
                      {g().name}
                    </div>
                  </Show>
                  <For each={g().models} keyed={(m) => m.id}>
                    {(m) => {
                      const on = () => !!props.value && current() === m();
                      const key = () => modelKey(m().provider, m().id);
                      const lit = () => pointed() === key();
                      return (
                        <button
                          type="button"
                          class={[
                            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-[background-color,opacity] duration-150 focus-visible:bg-active touch:py-2.5',
                            lit() && 'bg-hover',
                            pointed() && !lit() && 'opacity-55',
                          ]}
                          title={key()}
                          aria-pressed={on() ? 'true' : 'false'}
                          onPointerEnter={() => {
                            setByKey(false);
                            setPointed(key());
                          }}
                          onFocus={() => {
                            setByKey(true);
                            setPointed(key());
                          }}
                          onClick={() => {
                            popover?.hidePopover();
                            if (on()) return;
                            props.onChange({
                              model: {
                                provider: m().provider,
                                modelId: m().id,
                              },
                              thinkingLevel: levelFor(
                                m(),
                                props.value?.thinkingLevel ?? 'medium',
                              ),
                            });
                          }}
                        >
                          <span class="flex min-w-0 flex-1 flex-col">
                            <span class="flex items-center gap-1 font-medium">
                              <span class="truncate">{m().name}</span>
                              <Show when={on()}>
                                <span class="swap-in shrink-0">
                                  <CheckIcon />
                                </span>
                              </Show>
                            </span>
                            <span class="truncate text-meta text-muted">
                              {describe(m())}
                            </span>
                          </span>
                          <Bars
                            level={contextLevel(m())}
                            lit={lit()}
                            column={0}
                            instant={byKey()}
                          />
                          <Bars
                            level={priceLevel(m())}
                            lit={lit()}
                            column={1}
                            instant={byKey()}
                          />
                        </button>
                      );
                    }}
                  </For>
                </>
              )}
            </For>
          </div>
          <Show when={effortOn()}>
            <div class="border-t border-line p-1">
              <Show when={canSwitch()}>
                <label class="flex h-8 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-hover touch:h-11">
                  <span
                    class={[
                      'grid w-5 place-items-center transition-colors',
                      thinking() ? 'text-fg' : 'text-muted',
                    ]}
                  >
                    <ThoughtIcon />
                  </span>
                  <span class="flex-1" title="How hard the model thinks">
                    Thinking
                  </span>
                  <Switch
                    checked={thinking()}
                    label="Thinking"
                    onChange={(next) =>
                      props.onChange({
                        model: props.value!.model,
                        thinkingLevel: next
                          ? levelFor(current()!, lastEffort)
                          : 'off',
                      })
                    }
                  />
                </label>
              </Show>
              <div
                class="fold"
                data-open={thinking() || !canSwitch() || undefined}
                inert={canSwitch() && !thinking()}
              >
                <div>
                  <div
                    class={[
                      'flex items-center gap-2 py-1 pr-1',
                      canSwitch() ? 'pl-9.5' : 'pl-2',
                    ]}
                  >
                    <span class="flex-1 text-meta text-muted">Effort</span>
                    <Segmented>
                      <For each={efforts()}>
                        {(level) => (
                          <button
                            type="button"
                            class={segmentClass}
                            title={EFFORT[level][1]}
                            data-on={
                              props.value!.thinkingLevel === level || undefined
                            }
                            onClick={() => {
                              lastEffort = level;
                              props.onChange({
                                model: props.value!.model,
                                thinkingLevel: level,
                              });
                            }}
                          >
                            {EFFORT[level][0]}
                          </button>
                        )}
                      </For>
                    </Segmented>
                  </div>
                </div>
              </div>
            </div>
          </Show>
        </div>
        <Show when={shown()}>
          {(m) => (
            <div
              class="flex min-h-8 items-center gap-1 px-3 pt-1 text-meta text-muted tabular-nums"
              aria-hidden="true"
            >
              <Show
                when={priceLevel(m())}
                fallback={<span class="flex-1 truncate">No list price</span>}
              >
                <span class="flex min-w-0 flex-1 items-baseline gap-1 truncate">
                  <RollingNumber
                    value={m().cost.input}
                    format={dollars}
                    class="text-fg"
                  />
                  in ·
                  <RollingNumber
                    value={m().cost.output}
                    format={dollars}
                    class="text-fg"
                  />
                  out per 1M
                </span>
              </Show>
              <RollingNumber
                value={m().contextWindow}
                format={formatTokens}
                class="text-fg"
              />
              <span>context</span>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}
