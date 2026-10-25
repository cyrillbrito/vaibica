import { For, Repeat, createSignal } from 'solid-js';

/**
 * A bar per day, after the daily chart of affectUI's Usage Meter. The head
 * reads the average, or the day you point at; bars grow in on first view.
 * `values[0]` is the 1st of `month` (a Date in it).
 */
export function Sparkline(props: {
  values: number[];
  format: (n: number) => string;
  month: Date;
  class?: string;
}) {
  const [hot, setHot] = createSignal<number | null>(null, {
    name: 'sparkHot',
  });
  const max = () => Math.max(...props.values, 0) || 1;
  const average = () =>
    props.values.reduce((a, b) => a + b, 0) / (props.values.length || 1);
  const daysIn = () =>
    new Date(
      props.month.getFullYear(),
      props.month.getMonth() + 1,
      0,
    ).getDate();
  const day = (i: number) =>
    new Date(
      props.month.getFullYear(),
      props.month.getMonth(),
      i + 1,
    ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div class={['flex flex-col gap-1.5', props.class]}>
      <div class="flex justify-between gap-3 text-meta text-muted tabular-nums">
        <span>Per day</span>
        <For each={[hot()]}>
          {(h) => (
            <span class="appear">
              {h === null ? (
                <>
                  Avg <span class="text-fg">{props.format(average())}</span> a
                  day
                </>
              ) : (
                <>
                  {day(h)} ·{' '}
                  <span class="text-fg">{props.format(props.values[h]!)}</span>
                </>
              )}
            </span>
          )}
        </For>
      </div>
      <div
        class="flex h-8 items-stretch gap-0.5"
        role="img"
        aria-label={`Per day: ${props.format(average())} on average`}
        onPointerLeave={() => setHot(null)}
      >
        <For each={props.values}>
          {(v, i) => (
            <span
              class="flex min-w-0 flex-1 items-end"
              onPointerEnter={() => setHot(i())}
            >
              <span
                class={[
                  'w-full origin-bottom rounded-cell transition-[background-color,opacity] duration-150 motion-safe:animate-grow',
                  hot() === i() ? 'bg-accent' : 'bg-line-strong',
                  hot() !== null && hot() !== i() && 'opacity-60',
                ]}
                style={{
                  height: `${Math.max(6, (v / max()) * 100)}%`,
                  'animation-delay': `${i() * 18}ms`,
                }}
              />
            </span>
          )}
        </For>
        {/* Days still to come: flat stubs, so the month's length shows. */}
        <Repeat count={Math.max(0, daysIn() - props.values.length)}>
          {() => (
            <span class="flex min-w-0 flex-1 items-end">
              <span class="h-0.5 w-full rounded-cell bg-active" />
            </span>
          )}
        </Repeat>
      </div>
    </div>
  );
}
