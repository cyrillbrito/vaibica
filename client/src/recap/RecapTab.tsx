import { useNavigate } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import {
  Errored,
  For,
  Loading,
  Show,
  createMemo,
  createSignal,
  isPending,
} from 'solid-js';

import type { Recap, RecapActivity, WorkspaceRef } from '@bica/shared/protocol';
import { formatCost, formatTokens } from '@bica/shared/context-usage';
import { openHref } from '../files/files';
import { useSessions } from '../sessions/sessions';
import { IconButton } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { createArrival } from '../ui/arrive';
import { errorText } from '../ui/errors';
import { CheckIcon, RefreshIcon, StepsIcon } from '../ui/icons';
import { closeDrawer } from '../ui/layout';
import { formatDuration, timeAgo } from '../ui/time';
import { getRecap, recapActivity } from './recap';

// An experiment (docs/recap.md): the agent keeps no plan, and the fast model
// reads one from the transcript while the tab is open.

// While it runs, a new recap at most this often once something new happened:
// slower, and a fast run outgrew its "Next" before the next one.
const RUNNING_EVERY = 15_000;
// More changed files fold behind "Show all".
const FILES_SHOWN = 5;

/** The side panel's Recap tab, on a session's page only. */
export const recapTab = {
  id: 'recap',
  label: 'Recap',
  icon: StepsIcon,
  when: (at: { session: string | undefined }) => !!at.session,
  content: (props: {
    workspace: WorkspaceRef;
    session: string | undefined;
  }) => (
    <Show when={props.session}>
      {(id) => <RecapTab id={id()} workspace={props.workspace} />}
    </Show>
  ),
};

function RecapTab(props: { id: string; workspace: WorkspaceRef }) {
  const sessions = useSessions();
  const session = createMemo(() => sessions().find((s) => s.id === props.id), {
    name: 'recapSession',
  });
  const status = createMemo(() => session()?.status, { name: 'recapStatus' });
  const running = () => status() === 'running' || status() === 'retrying';
  const updated = createMemo(() => session()?.updatedAt ?? 0, {
    name: 'recapUpdated',
  });
  const beat = createMemo(
    () => (running() ? Math.floor(updated() / RUNNING_EVERY) : 0),
    { name: 'recapBeat' },
  );
  const [asked, setAsked] = createSignal(0, { name: 'recapAsked' });

  const activity = createMemo(
    () => {
      updated();
      status();
      return recapActivity(props.id);
    },
    { name: 'recapActivity' },
  );
  const recap = createMemo(
    () => {
      status();
      beat();
      // After a Refresh, skip the server's cache.
      return getRecap(props.id, asked() > 0);
    },
    { name: 'recap' },
  );

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 pt-3 pb-6">
      <Errored
        fallback={(error) => (
          <p class="text-ui break-words text-danger-ink">
            {errorText(error())}
          </p>
        )}
      >
        <Loading
          fallback={
            <p class="shimmer text-ui text-muted">Reading the session</p>
          }
        >
          <Show
            when={recap()}
            fallback={
              <p class="text-ui text-muted">
                Set a fast model in Settings → Models to get a recap.
              </p>
            }
          >
            {(r) => (
              <RecapView
                id={props.id}
                recap={r()}
                running={running()}
                refresh={
                  <IconButton
                    title="Write a new recap"
                    loading={isPending(() => recap())}
                    onClick={() => setAsked((n) => n + 1)}
                  >
                    <RefreshIcon />
                  </IconButton>
                }
              />
            )}
          </Show>
        </Loading>
      </Errored>
      <Errored
        fallback={(error) => (
          <p class="text-ui break-words text-danger-ink">
            {errorText(error())}
          </p>
        )}
      >
        <Loading>
          <ActivityView activity={activity()} workspace={props.workspace} />
        </Loading>
      </Errored>
    </div>
  );
}

function Section(props: {
  title: string;
  count?: number;
  action?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <section class="flex flex-col gap-2">
      <header class="flex h-7 items-center gap-1.5">
        <h2 class="text-meta text-muted">{props.title}</h2>
        <Show when={props.count}>
          <span class="text-meta text-muted tabular-nums">{props.count}</span>
        </Show>
        <span class="-mr-1.5 ml-auto">{props.action}</span>
      </header>
      {props.children}
    </section>
  );
}

function RecapView(props: {
  id: string;
  recap: Recap;
  running: boolean;
  refresh: JSX.Element;
}) {
  const goalRef = createArrival(
    () => props.recap.goal,
    () => props.id,
  );
  const nowRef = createArrival(
    () => props.recap.now,
    () => props.id,
  );
  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-start gap-2">
          <p
            ref={goalRef}
            class="min-w-0 flex-1 pt-1 text-ui font-medium text-fg"
          >
            {props.recap.goal}
          </p>
          <span class="-mr-1.5 shrink-0">{props.refresh}</span>
        </div>
        <Show when={props.recap.now}>
          <p ref={nowRef} class="flex items-start gap-2 text-ui text-muted">
            <Show
              when={props.running}
              fallback={
                <span class="mt-1.5 size-2 shrink-0 rounded-full bg-line-strong" />
              }
            >
              <Spinner class="mt-0.5 text-running" />
            </Show>
            <span>{props.recap.now}</span>
          </p>
        </Show>
      </div>
      <Show when={props.recap.done.length}>
        <List title="Done">
          <For each={props.recap.done}>
            {(item) => (
              <li class="flex items-start gap-2 text-muted [&_svg]:mt-0.5 [&_svg]:shrink-0">
                <CheckIcon />
                <span>{item}</span>
              </li>
            )}
          </For>
        </List>
      </Show>
      <Show when={props.recap.next.length}>
        <List title="Next">
          <For each={props.recap.next}>
            {(item) => (
              <li class="flex items-start gap-2 text-fg">
                <span class="mt-0.5 grid size-4 shrink-0 place-items-center">
                  <span class="size-2.5 rounded-full border border-line-strong" />
                </span>
                <span>{item}</span>
              </li>
            )}
          </For>
        </List>
      </Show>
      <p
        class="text-meta text-muted"
        title={`${props.recap.model} · ${formatTokens(props.recap.tokens)} tokens · ${formatCost(props.recap.cost)} · ${formatDuration(props.recap.ms)}`}
      >
        Written{' '}
        {timeAgo(props.recap.at) === 'now'
          ? 'just now'
          : `${timeAgo(props.recap.at)} ago`}{' '}
        by {props.recap.model.split('/').pop()} · {formatCost(props.recap.cost)}
      </p>
    </div>
  );
}

function List(props: { title: string; children: JSX.Element }) {
  return (
    <div class="flex flex-col gap-1">
      <h3 class="text-meta text-muted">{props.title}</h3>
      <ul class="flex flex-col gap-1 text-ui">{props.children}</ul>
    </div>
  );
}

function ActivityView(props: {
  activity: RecapActivity;
  workspace: WorkspaceRef;
}) {
  const navigate = useNavigate();
  const [all, setAll] = createSignal(false, { name: 'recapAllFiles' });
  const files = () =>
    all() ? props.activity.files : props.activity.files.slice(0, FILES_SHOWN);
  const span = () =>
    props.activity.startedAt && props.activity.lastAt
      ? props.activity.lastAt - props.activity.startedAt
      : 0;
  const counts = () =>
    [
      plural(props.activity.prompts, 'prompt'),
      plural(props.activity.calls, 'tool call'),
      props.activity.failed && `${props.activity.failed} failed`,
      span() && formatDuration(span()),
    ].filter(Boolean);
  return (
    <>
      <Section title="Changed files" count={props.activity.files.length}>
        <Show
          when={props.activity.files.length}
          fallback={
            <p class="text-ui text-muted">
              No edits yet. Changes made through bash show in Git.
            </p>
          }
        >
          <ul class="-mx-1.5 flex flex-col">
            <For each={files()}>
              {(file) => (
                <li>
                  <button
                    class="flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left text-ui hover:bg-hover touch:h-11"
                    title={file.path}
                    onClick={() => {
                      closeDrawer();
                      navigate(
                        openHref(props.workspace, {
                          path: file.path,
                          view: 'file',
                        }),
                      );
                    }}
                  >
                    <span class="min-w-0 truncate">
                      <span class="text-fg">{baseName(file.path)}</span>
                      <Show when={dirName(file.path)}>
                        <span class="ml-1.5 text-meta text-muted">
                          {dirName(file.path)}
                        </span>
                      </Show>
                    </span>
                    <Show when={file.edits > 1}>
                      <span class="ml-auto shrink-0 text-meta text-muted tabular-nums">
                        ×{file.edits}
                      </span>
                    </Show>
                  </button>
                </li>
              )}
            </For>
          </ul>
          <Show when={props.activity.files.length > FILES_SHOWN}>
            <button
              class="self-start text-meta text-muted hover:text-fg"
              onClick={() => setAll((a) => !a)}
            >
              {all() ? 'Show fewer' : `Show all ${props.activity.files.length}`}
            </button>
          </Show>
        </Show>
      </Section>
      <Section title="Activity">
        <p class="text-ui text-fg">{counts().join(' · ')}</p>
        <Show when={props.activity.tools.length}>
          <p class="text-meta text-muted">
            {props.activity.tools
              .map((t) => `${t.name} ${t.count}`)
              .join(' · ')}
          </p>
        </Show>
      </Section>
    </>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function baseName(path: string) {
  return path.split('/').pop() ?? path;
}

function dirName(path: string) {
  return path.split('/').slice(0, -1).join('/');
}
