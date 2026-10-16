import { For, Match, Show, Switch } from 'solid-js';
import Activity from './Activity';
import AskCard from './AskCard';
import ErrorReply from './ErrorReply';
import Markdown from './Markdown';
import { IconButton } from './ui/Button';
import { CopyButton } from './ui/CopyButton';
import {
  ChevronIcon,
  CompactIcon,
  CopyIcon,
  ForkIcon,
  InfoIcon,
  SessionIcon,
  SpinnerIcon,
  VoiceIcon,
} from './ui/icons';
import { copyText } from '#lib/clipboard';
import { paths } from '../router';
import { imageUrl, openImage } from '#lib/images';
import { clockTime } from '#lib/time';
import { formatTokens } from '#lib/context-usage';
import { contextMenu } from './ui/ContextMenu';
import { type Message } from '#lib/transcript';

export default function MessageRow(props: {
  message: Message;
  // Unset: no fork button, as on the hub.
  onFork?: (at: number) => void;
  onAnswer: (text: string) => Promise<unknown>;
  // A fork's original, for the divider.
  parent?: { id: string; title: string };
  // Where relative paths in replies start.
  cwd?: string;
}) {
  const text = () =>
    'text' in props.message ? (props.message.text ?? '') : '';
  // A static wrapper: the list's insert effect then doesn't track every row.
  return (
    <div
      class="group/row flex flex-col rounded-lg"
      data-key={props.message.key}
      data-kind={props.message.kind}
    >
      <Switch>
        <Match
          when={
            props.message.kind === 'user' && props.message.from
              ? { ...props.message, from: props.message.from }
              : undefined
          }
        >
          {(note) => {
            const head = () => note().text.split('\n', 1)[0]!;
            const rest = () => note().text.slice(head().length).trim();
            return (
              // Sent by Bica or another session: the agent reads it as a
              // prompt, but it isn't yours, so it stays out of the way.
              <details class="group/note expand border-l-2 border-line pl-3">
                <summary
                  class={[
                    'flex min-w-0 list-none items-center gap-1.5 text-meta text-muted [&::-webkit-details-marker]:hidden',
                    rest()
                      ? 'cursor-pointer hover:text-fg'
                      : 'pointer-events-none',
                  ]}
                >
                  {note().from.session ? <SessionIcon /> : <InfoIcon />}
                  <Show
                    when={note().from.session}
                    fallback={<span class="shrink-0">{note().from.label}</span>}
                  >
                    {(id) => (
                      <a
                        class="pointer-events-auto max-w-40 shrink-0 truncate hover:text-fg hover:underline"
                        href={paths.s(id())}
                      >
                        {note().from.label}
                      </a>
                    )}
                  </Show>
                  <span class="min-w-0 truncate">· {head()}</span>
                  <time
                    class="shrink-0"
                    datetime={new Date(note().timestamp).toISOString()}
                    title={new Date(note().timestamp).toLocaleString()}
                  >
                    · {clockTime(note().timestamp)}
                  </time>
                  <Show when={rest()}>
                    <span class="shrink-0 transition-transform group-open/note:rotate-90">
                      <ChevronIcon />
                    </span>
                  </Show>
                </summary>
                <Show when={rest()}>
                  {(body) => (
                    <div class="mt-2">
                      <Markdown text={body()} cwd={props.cwd} />
                    </div>
                  )}
                </Show>
              </details>
            );
          }}
        </Match>
        <Match when={props.message.kind === 'user' ? props.message : undefined}>
          {(user) => (
            <div class="flex max-w-[85%] flex-col items-end gap-1 self-end">
              <Show when={user().images.length}>
                <div class="flex flex-wrap justify-end gap-1.5">
                  <For each={user().images}>
                    {(image) => (
                      <button
                        type="button"
                        class="block cursor-zoom-in overflow-hidden rounded-card border border-line"
                        title="Open full size"
                        onClick={() => openImage(image)}
                      >
                        <img
                          src={imageUrl(image)}
                          alt=""
                          class="max-h-40 max-w-full object-contain"
                        />
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={user().text}>
                <div
                  {...contextMenu(() => [
                    {
                      label: 'Copy',
                      icon: <CopyIcon />,
                      onSelect: () => void copyText(user().text),
                    },
                  ])}
                  class="context-target rounded-sheet border border-line bg-surface max-w-full px-3.5 py-2.5 text-read whitespace-pre-wrap wrap-anywhere"
                >
                  {user().text}
                </div>
              </Show>
              <div class="flex items-center gap-0.5 text-meta text-muted">
                <Show when={user().text}>
                  <CopyButton
                    title="Copy prompt"
                    text={() => user().text}
                    class="opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 focus-visible:opacity-100 touch:hidden"
                  />
                </Show>
                <time
                  class="px-1"
                  datetime={new Date(user().timestamp).toISOString()}
                  title={new Date(user().timestamp).toLocaleString()}
                >
                  {clockTime(user().timestamp)}
                </time>
              </div>
            </div>
          )}
        </Match>
        <Match when={props.message.kind === 'text'}>
          <Markdown text={text()} cwd={props.cwd} />
        </Match>
        <Match
          when={props.message.kind === 'activity' ? props.message : undefined}
        >
          {(activity) => <Activity activity={activity()} />}
        </Match>
        <Match when={props.message.kind === 'ask' ? props.message : undefined}>
          {(ask) => (
            <AskCard
              questions={ask().questions}
              open={ask().open}
              onAnswer={props.onAnswer}
            />
          )}
        </Match>
        <Match when={props.message.kind === 'call' ? props.message : undefined}>
          {(c) => (
            // Said in a voice call: a record for you, not the agent's context.
            <div class="flex flex-col gap-1.5 border-l-2 border-line pl-3">
              <div class="flex items-center gap-1.5 text-meta text-muted">
                <VoiceIcon />
                Voice call
                <time datetime={new Date(c().lines[0]!.at).toISOString()}>
                  · {clockTime(c().lines[0]!.at)}
                </time>
              </div>
              <For each={c().lines}>
                {(line) => (
                  <p class="text-ui">
                    <span
                      class={[
                        'mr-1.5 font-medium',
                        line.who === 'you' ? 'text-muted' : 'text-accent',
                      ]}
                    >
                      {line.who === 'you' ? 'You' : 'Voice'}
                    </span>
                    {line.text}
                  </p>
                )}
              </For>
            </div>
          )}
        </Match>
        <Match when={props.message.kind === 'end' ? props.message : undefined}>
          {(end) => (
            // Tucked under the answer it belongs to: quiet until the answer
            // is hovered or focused (affectUI's Message Actions).
            <div
              class="-mt-4 -ml-1.5 flex text-muted opacity-0 transition-opacity duration-200 ease-out group-data-show/row:opacity-100 focus-within:opacity-100 touch:opacity-100"
              role="toolbar"
              aria-label="Answer actions"
            >
              <Show when={end().text}>
                {(text) => <CopyButton title="Copy as Markdown" text={text} />}
              </Show>
              <Show when={props.onFork}>
                {(fork) => (
                  <IconButton
                    size="sm"
                    title="Fork from here"
                    onClick={() => fork()(end().at)}
                  >
                    <ForkIcon />
                  </IconButton>
                )}
              </Show>
            </div>
          )}
        </Match>
        <Match when={props.message.kind === 'forked'}>
          <div class={RULE}>
            <div class="h-px flex-1 bg-line" />
            <Show when={props.parent} fallback="Forked here">
              {(parent) => (
                <a
                  class="flex min-w-0 items-center gap-1.5 hover:text-fg"
                  href={paths.s(parent().id)}
                >
                  <ForkIcon />
                  <span class="truncate">
                    Forked from {parent().title || 'another session'}
                  </span>
                </a>
              )}
            </Show>
            <div class="h-px flex-1 bg-line" />
          </div>
        </Match>
        <Match
          when={props.message.kind === 'compaction' ? props.message : undefined}
        >
          {(c) => (
            <details class="group/row expand">
              <summary
                class={[RULE, 'cursor-pointer list-none hover:text-fg']}
                title={`${c().before ? `${formatTokens(c().before!)} tokens of context summarized into` : 'Summarized into'} about ${formatTokens(c().after)}. Click to read the summary.`}
              >
                <div class="h-px flex-1 bg-line" />
                <CompactIcon />
                {c().auto ? 'Auto-compacted' : 'Compacted'}
                <span class="tabular-nums">
                  · {c().before ? `${formatTokens(c().before!)} → ` : ''}
                  {formatTokens(c().after)}
                </span>
                <span class="transition-transform group-open/row:rotate-90">
                  <ChevronIcon />
                </span>
                <div class="h-px flex-1 bg-line" />
              </summary>
              <div class="mt-3 rounded-card border border-line bg-panel/50 px-4 py-3">
                <Markdown text={c().summary} />
              </div>
            </details>
          )}
        </Match>
        <Match
          when={props.message.kind === 'compacting' ? props.message : undefined}
        >
          {(c) => (
            <div
              class={[RULE, c().retry && 'text-warn']}
              title={c().retry}
              role="status"
            >
              <div class="h-px flex-1 bg-line" />
              <SpinnerIcon />
              <span class={c().retry ? undefined : 'shimmer'}>
                {c().retry
                  ? 'Compacting failed, retrying…'
                  : c().auto
                    ? 'Context is full, compacting…'
                    : 'Compacting context…'}
              </span>
              <div class="h-px flex-1 bg-line" />
            </div>
          )}
        </Match>
        <Match when={props.message.kind === 'error'}>
          <ErrorReply text={text()} />
        </Match>
      </Switch>
    </div>
  );
}

// A full-width line with a label in the middle.
export const RULE =
  'flex items-center gap-2 text-meta text-muted [&::-webkit-details-marker]:hidden';
