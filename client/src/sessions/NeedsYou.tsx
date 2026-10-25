import { For, Show, createMemo, createSignal } from 'solid-js';

import { reducedMotion } from '../ui/motion';
import { useProjects, workspaceName } from '../projects/projects';
import type { SessionStatus, SessionSummary } from '@bica/shared/protocol';
import { markSeen, useSessions } from './sessions';
import { timeAgo } from '../ui/time';
import { paths } from '../router';
import { IconButton } from '../ui/Button';
import { CloseIcon } from '../ui/icons';
import { RollingNumber } from '../ui/RollingNumber';
import StatusDot from './StatusDot';
import { Tag, type Tone } from '../ui/Tag';

// Waiting on an answer first, then failures, then answers not yet read.
const RANK: Partial<Record<SessionStatus, number>> = {
  waiting: 0,
  error: 1,
  done: 2,
};

const WHAT: Partial<Record<SessionStatus, [string, string, Tone]>> = {
  waiting: ['Waiting for you', 'Asked', 'accent'],
  error: ['Failed', 'Failed', 'danger'],
  done: ['Done', 'Finished', 'neutral'],
};

// How far each card behind peeks out under the one in front.
const PEEK = 10;

/**
 * The sessions that need you, as a stack on the home page, after affectUI's
 * Notification Stack: only the front card reads, two more peek out below,
 * and dismissing it slides it away while the next moves up. Dismissing a
 * finished one marks it read; the others only hide here until they change.
 */
export default function NeedsYou() {
  const sessions = useSessions();
  const projects = useProjects();
  // Each hidden card by id, status and time, so a new run brings it back.
  const [hidden, setHidden] = createSignal<string[]>([], {
    name: 'needsYouHidden',
  });
  const [leaving, setLeaving] = createSignal<string>();
  const stamp = (s: SessionSummary) => `${s.id}:${s.status}:${s.updatedAt}`;

  const items = createMemo(
    () =>
      sessions()
        .filter(
          (s) =>
            !s.archivedAt &&
            RANK[s.status] !== undefined &&
            !hidden().includes(stamp(s)),
        )
        .sort(
          (a, b) =>
            RANK[a.status]! - RANK[b.status]! || b.updatedAt - a.updatedAt,
        ),
    { name: 'needsYou' },
  );
  const standing = () => items().filter((s) => s.id !== leaving());
  const depthOf = (id: string) => standing().findIndex((s) => s.id === id);

  const dismiss = (s: SessionSummary) => {
    if (s.status === 'done') void markSeen(s.id);
    const hide = () => {
      setHidden((h) => [...h, stamp(s)]);
      setLeaving(undefined);
    };
    if (reducedMotion()) return hide();
    setLeaving(s.id);
    setTimeout(hide, 300);
  };

  const where = (s: SessionSummary) => {
    const project = projects().find((p) => p.id === s.projectId);
    return project && s.cwd ? workspaceName(project, s.cwd) : project?.name;
  };

  return (
    <Show when={items().length}>
      <section
        class="appear mx-auto grid w-full max-w-md motion-safe:transition-[padding] motion-safe:duration-200 motion-safe:ease-out"
        style={{
          'padding-bottom': `${Math.min(standing().length - 1, 2) * PEEK}px`,
        }}
        aria-label="Needs you"
      >
        <For each={items()} keyed={(s) => s.id}>
          {(s) => {
            const depth = () => depthOf(s().id);
            const gone = () => depth() < 0;
            const what = () => WHAT[s().status]!;
            return (
              <article
                class={[
                  'col-start-1 row-start-1 origin-bottom overflow-hidden rounded-sheet border border-line bg-surface shadow-raised',
                  'transition-[opacity] duration-200 motion-safe:transition-[translate,scale,opacity] motion-safe:duration-300 motion-safe:ease-out',
                  gone() && 'opacity-0 motion-safe:translate-x-10',
                  depth() > 2 && 'opacity-0',
                ]}
                style={{
                  'z-index': gone() ? 10 : 10 - depth(),
                  translate: gone() ? undefined : `0 ${depth() * PEEK}px`,
                  scale: gone()
                    ? undefined
                    : `${1 - Math.min(depth(), 2) * 0.05}`,
                }}
                aria-hidden={depth() !== 0 ? 'true' : undefined}
                inert={depth() !== 0}
              >
                <div
                  class={[
                    'flex flex-col gap-1 py-3 pr-2 pl-4 transition-opacity duration-200',
                    depth() !== 0 && 'opacity-0',
                  ]}
                >
                  <div class="flex min-h-7 items-center gap-2">
                    <StatusDot status={s().status} />
                    <Tag tone={what()[2]}>{what()[0]}</Tag>
                    <span class="min-w-0 flex-1 truncate text-meta text-muted">
                      {where(s())}
                    </span>
                    <Show when={standing().length > 1}>
                      <span class="shrink-0 text-meta text-muted tabular-nums">
                        +
                        <RollingNumber value={standing().length - 1} /> more
                      </span>
                    </Show>
                    <IconButton
                      size="sm"
                      title={
                        s().status === 'done' ? 'Mark as read' : 'Hide for now'
                      }
                      onClick={() => dismiss(s())}
                    >
                      <CloseIcon />
                    </IconButton>
                  </div>
                  <a
                    class="group -ml-1 flex flex-col rounded-md px-1 py-0.5 pr-3 outline-offset-0"
                    href={paths.s(s().id)}
                  >
                    <span
                      class="truncate font-medium group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-2"
                      dir="auto"
                    >
                      {s().title || 'Untitled session'}
                    </span>
                    <span class="text-meta text-muted">
                      {what()[1]} {timeAgo(s().updatedAt)}
                      {timeAgo(s().updatedAt) === 'now' ? '' : ' ago'} · Open to{' '}
                      {s().status === 'waiting'
                        ? 'answer'
                        : s().status === 'error'
                          ? 'see why'
                          : 'read'}
                    </span>
                  </a>
                </div>
              </article>
            );
          }}
        </For>
      </section>
    </Show>
  );
}
