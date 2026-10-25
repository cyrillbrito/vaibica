import type { JSX } from '@solidjs/web';
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  untrack,
} from 'solid-js';

const RAYS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * "The agent is working": eight rays turning and a shimmering label. A new
 * label rolls in as the old one rolls out, and the pill glides to its width.
 * When done, the rays give way to a check (or `doneIcon`) and the label to
 * `doneLabel`. After affectUI's Thinking Loader. The rays and shimmer stay
 * on under reduced motion (they say work is happening); the rest is instant.
 */
export function ThinkingLoader(props: {
  /** What it's doing now. Changing it rolls the new text in. */
  label?: string;
  /** Labels to walk through on a timer when no `label` is given; holds the last. */
  phases?: string[];
  /** Milliseconds per phase. */
  interval?: number;
  done?: boolean;
  /** Text once done; a function gets the seconds since work started. */
  doneLabel?: string | ((seconds: number) => string);
  /** Shown instead of the check once done, e.g. the step's own icon. */
  doneIcon?: JSX.Element;
  /** `pill`: a bordered capsule. `plain`: icon and label only, laid out by the parent (`display: contents`). */
  variant?: 'pill' | 'plain';
  /** Off when the label already has a fixed width (`labelClass`). */
  fit?: boolean;
  class?: string;
  labelClass?: string;
}) {
  const [step, setStep] = createSignal(0);
  const [started, setStarted] = createSignal(Date.now());
  createEffect(
    () => !props.done && props.label === undefined && props.phases?.length,
    (n) => {
      if (!n || n < 2) return;
      const id = setInterval(
        () => setStep((s) => Math.min(s + 1, n - 1)),
        props.interval ?? 2200,
      );
      return () => clearInterval(id);
    },
  );
  // Work starting again restarts the clock and the phases.
  createEffect(
    () => !!props.done,
    (done, was) => {
      if (!done && was) {
        setStarted(Date.now());
        setStep(0);
      }
    },
  );

  const text = createMemo(() => {
    if (props.done) {
      const d = props.doneLabel ?? 'Done';
      if (typeof d === 'string') return d;
      return d(Math.max(1, Math.round((Date.now() - started()) / 1000)));
    }
    return props.label ?? props.phases?.[step()] ?? '';
  });

  // The label on screen plus the one rolling out. The first one just shows.
  let n = 0;
  const [labels, setLabels] = createSignal([
    { key: 0, text: untrack(text), out: false },
  ]);
  createEffect(text, (t, prev) => {
    if (prev === undefined || t === prev) return;
    setLabels((ls) => [
      ...ls.filter((l) => !l.out).map((l) => ({ ...l, out: true })),
      { key: ++n, text: t, out: false },
    ]);
  });
  const drop = (key: number) =>
    setLabels((ls) => ls.filter((l) => l.key !== key));

  // Done from the start (a reload): the check is just there, not drawn.
  const doneAtStart = untrack(() => !!props.done);

  let box: HTMLSpanElement;
  onSettled(() => {
    if (props.fit === false) return;
    const fit = () => {
      const cur = box.querySelector<HTMLElement>(':scope > [data-current]');
      if (cur) box.style.width = `${cur.offsetWidth + 1}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    const mo = new MutationObserver(() => {
      ro.disconnect();
      for (const el of box.children) ro.observe(el);
      fit();
    });
    for (const el of box.children) ro.observe(el);
    mo.observe(box, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  });

  return (
    <span
      role="status"
      class={[
        props.variant === 'plain'
          ? 'contents'
          : 'inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface pr-3.5 pl-3 align-middle text-muted',
        props.class,
      ]}
      data-done={props.done ? '' : undefined}
    >
      <span class="relative size-4 shrink-0" aria-hidden="true">
        <svg
          viewBox="0 0 16 16"
          class={[
            'absolute inset-0 size-full stroke-current transition-[opacity,scale,rotate] duration-200 ease-out',
            props.done && 'scale-60 -rotate-45 opacity-0',
          ]}
        >
          <For each={RAYS}>
            {(i) => (
              <line
                x1="8"
                y1="1.75"
                x2="8"
                y2="4.75"
                stroke-width="1.6"
                stroke-linecap="round"
                transform={`rotate(${i * 45} 8 8)`}
                class="animate-ray opacity-20"
                style={{ 'animation-delay': `${(i - 8) * 100}ms` }}
              />
            )}
          </For>
        </svg>
        <Show when={props.done}>
          <Show
            when={props.doneIcon}
            fallback={
              <svg
                viewBox="0 0 16 16"
                class="absolute inset-0 size-full fill-none stroke-current text-fg"
              >
                <path
                  d="M3.5 8.4 6.6 11.3 12.5 4.9"
                  pathLength="1"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class={doneAtStart ? undefined : 'draw'}
                />
              </svg>
            }
          >
            <span
              class={[
                'absolute inset-0 grid place-items-center',
                !doneAtStart && 'swap-in',
              ]}
            >
              {props.doneIcon}
            </span>
          </Show>
        </Show>
      </span>
      <span
        ref={(el) => (box = el)}
        class={[
          'relative block h-5 overflow-hidden whitespace-nowrap',
          props.fit !== false && 'morph',
          props.labelClass,
        ]}
      >
        <For each={labels()} keyed={(l) => l.key}>
          {(l) => (
            <span
              data-current={l().out ? undefined : ''}
              aria-hidden={l().out ? 'true' : undefined}
              class={l().out ? 'roll-out' : l().key > 0 && 'roll-in'}
              onAnimationEnd={(e) =>
                l().out && e.target === e.currentTarget && drop(l().key)
              }
            >
              {/* Its own layer: the shimmer is an animation too. */}
              <span
                class={[
                  !l().out && !props.done && 'shimmer',
                  !l().out &&
                    props.done &&
                    props.variant !== 'plain' &&
                    'text-fg',
                ]}
              >
                {l().text}
              </span>
            </span>
          )}
        </For>
      </span>
    </span>
  );
}
