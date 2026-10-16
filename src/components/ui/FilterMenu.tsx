import { For, Show, createSignal, createUniqueId, untrack } from 'solid-js';

import { buttonClass } from './Button';
import { CheckMark } from './CheckMark';
import Chevron from './Chevron';
import { CloseIcon, FilterIcon } from './icons';

export type FilterOption = { id: string; label: string; count?: number };
export type FilterGroup = {
  id: string;
  label: string;
  options: FilterOption[];
  // Before the option on its chip, e.g. "In " → "In src".
  chipPrefix?: string;
};
/** Picked option ids per group id. */
export type FilterValue = Record<string, string[]>;

export const filterCount = (v: FilterValue) =>
  Object.values(v).reduce((n, ids) => n + ids.length, 0);

/** Whether an item passes: in each group with picks, one of them matches. */
export const passes = (v: FilterValue, item: Record<string, string>) =>
  Object.entries(v).every(
    ([group, ids]) => !ids.length || ids.includes(item[group] ?? ''),
  );

const toggle = (v: FilterValue, group: string, id: string): FilterValue => {
  const cur = v[group] ?? [];
  return {
    ...v,
    [group]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
  };
};

/** The picked filters as removable chips, in the order of their groups. */
export function FilterChips(props: {
  groups: FilterGroup[];
  value: FilterValue;
  onChange: (v: FilterValue) => void;
  class?: string;
}) {
  const chips = () =>
    props.groups.flatMap((g) =>
      g.options
        .filter((o) => props.value[g.id]?.includes(o.id))
        .map((o) => ({
          key: `${g.id}:${o.id}`,
          group: g.id,
          id: o.id,
          label: `${g.chipPrefix ?? ''}${o.label}`,
        })),
    );
  return (
    <Show when={chips().length}>
      <div class={['flex flex-wrap gap-1.5', props.class]} aria-live="polite">
        <For each={chips()} keyed={(c) => c.key}>
          {(c) => (
            <span class="flex h-6 items-center gap-0.5 rounded-md bg-hover pr-0.5 pl-2 text-meta whitespace-nowrap motion-safe:animate-chip-in touch:h-9">
              {c().label}
              <button
                type="button"
                class="grid size-5 place-items-center rounded-sm text-muted transition-colors hover:bg-active hover:text-fg [&_svg]:size-3.5 touch:size-8"
                aria-label={`Remove ${c().label}`}
                onClick={() =>
                  props.onChange(toggle(props.value, c().group, c().id))
                }
              >
                <CloseIcon />
              </button>
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}

/**
 * A Filter button that opens grouped checkboxes (affectUI's Filter Menu):
 * groups fold open and shut, each says how many of its options are picked,
 * checks draw in. Arrows move through groups and options, ← and → fold a
 * group, Enter or Space picks. A sheet on the phone.
 */
export function FilterMenu(props: {
  groups: FilterGroup[];
  value: FilterValue;
  onChange: (v: FilterValue) => void;
  title?: string;
  class?: string;
}) {
  const id = `filter-${createUniqueId()}`;
  const [open, setOpen] = createSignal<Record<string, boolean>>(
    // The first group starts open; later changes to the groups don't reset it.
    untrack(() =>
      Object.fromEntries(props.groups.slice(0, 1).map((g) => [g.id, true])),
    ),
    { name: 'filterGroupsOpen' },
  );
  const isOpen = (g: string) => !!open()[g];
  const fold = (g: string, on = !isOpen(g)) =>
    setOpen((o) => ({ ...o, [g]: on }));
  const picked = () => filterCount(props.value);
  let list!: HTMLDivElement;

  const rows = () => [
    ...list.querySelectorAll<HTMLElement>('[data-fm-row]:not([inert] *)'),
  ];
  const onKeyDown = (e: KeyboardEvent) => {
    const all = rows();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) =>
      all[Math.max(0, Math.min(all.length - 1, i))]?.focus();
    const group = (document.activeElement as HTMLElement | null)?.dataset
      .fmGroup;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      go(at < 0 ? 0 : at + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      go(e.key === 'Home' ? 0 : all.length - 1);
    } else if (group && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      fold(group, e.key === 'ArrowRight');
      if (e.key === 'ArrowLeft')
        list.querySelector<HTMLElement>(`[data-fm-head="${group}"]`)?.focus();
    }
  };

  return (
    <>
      <button
        type="button"
        popovertarget={id}
        class={[
          buttonClass({ variant: 'outline', size: 'sm' }),
          picked() && 'border-line-strong text-fg',
          props.class,
        ]}
        style={{ 'anchor-name': `--${id}` }}
        aria-haspopup="dialog"
      >
        <FilterIcon />
        Filter
        <Show when={picked()}>
          <span class="rounded-sm bg-accent/15 px-1 text-accent tabular-nums">
            {picked()}
          </span>
        </Show>
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label={props.title ?? 'Filters'}
        style={{ '--anchor': `--${id}` }}
        class={[
          'm-0 flex-col bg-panel p-1 text-fg shadow-menu open:flex max-md:sheet max-md:shadow-sheet md:pop md:origin-top-right',
          'inset-x-0 top-auto bottom-0 w-full max-w-none rounded-t-tray pb-[env(safe-area-inset-bottom)] backdrop:bg-black/40',
          'md:inset-auto md:mt-1 md:w-72 md:rounded-tray md:pb-1 md:backdrop:bg-transparent md:[position-anchor:var(--anchor)] md:[position-area:bottom_span-left] md:[position-try-fallbacks:flip-block]',
        ]}
      >
        <div class="flex flex-col rounded-sheet border border-line bg-surface px-3 pt-3 pb-2">
          <div class="flex items-center justify-between gap-3 px-0.5">
            <span class="font-semibold">{props.title ?? 'Filters'}</span>
            <button
              type="button"
              class="-mr-1.5 rounded-md px-1.5 py-0.5 text-meta text-muted transition-colors touch:py-3.5 not-disabled:hover:bg-hover not-disabled:hover:text-fg disabled:opacity-45"
              disabled={!picked()}
              onClick={() => props.onChange({})}
            >
              Clear all
            </button>
          </div>
          <FilterChips
            class="pt-2.5"
            groups={props.groups}
            value={props.value}
            onChange={props.onChange}
          />
          <div
            ref={(el) => (list = el)}
            class="grid pt-1.5"
            onKeyDown={onKeyDown}
          >
            <For each={props.groups} keyed={(g) => g.id}>
              {(g) => {
                const count = () => props.value[g().id]?.length ?? 0;
                return (
                  <section>
                    <button
                      type="button"
                      data-fm-row
                      data-fm-head={g().id}
                      data-fm-group={g().id}
                      class="-mx-1.5 mt-0.5 flex h-8 w-[calc(100%+--spacing(3))] items-center gap-1.5 rounded-lg px-1.5 text-left transition-colors hover:bg-hover touch:h-11"
                      aria-expanded={isOpen(g().id) ? 'true' : 'false'}
                      onClick={() => fold(g().id)}
                    >
                      <Chevron open={isOpen(g().id)} />
                      <span class="font-medium">{g().label}</span>
                      <span class="text-meta text-muted tabular-nums">
                        {g().options.length}
                      </span>
                      <span class="ml-auto text-meta text-muted">
                        {count()
                          ? `${count()} filter${count() === 1 ? '' : 's'}`
                          : ''}
                      </span>
                    </button>
                    <div
                      class="fold"
                      data-open={isOpen(g().id) ? '' : undefined}
                      inert={!isOpen(g().id)}
                      role="group"
                      aria-label={g().label}
                    >
                      <div class="grid gap-px pb-1.5">
                        <For each={g().options} keyed={(o) => o.id}>
                          {(o) => {
                            const on = () =>
                              !!props.value[g().id]?.includes(o().id);
                            return (
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on() ? 'true' : 'false'}
                                data-fm-row
                                data-fm-group={g().id}
                                class="group/opt -mx-1.5 flex h-8 w-[calc(100%+--spacing(3))] items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-hover touch:h-11"
                                onClick={() =>
                                  props.onChange(
                                    toggle(props.value, g().id, o().id),
                                  )
                                }
                              >
                                <CheckMark on={on()} />
                                <span class="min-w-0 flex-1 truncate">
                                  {o().label}
                                </span>
                                <Show when={o().count !== undefined}>
                                  <span class="text-meta text-muted tabular-nums">
                                    {o().count}
                                  </span>
                                </Show>
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    </div>
                  </section>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </>
  );
}
