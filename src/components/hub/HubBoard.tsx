import { For, Show, createMemo } from 'solid-js';

import type { SessionStatus, SessionSummary } from '#lib/protocol';
import { useProjects, workspaceName } from '#lib/projects';
import { useSessions } from '#lib/sessions';
import { timeAgo } from '#lib/time';
import { paths } from '../../router';
import StatusDot from '../StatusDot';
import { ChevronIcon } from '../ui/icons';

// What needs you comes first: a question, then a failure, then a reply.
const RANK: Record<SessionStatus, number> = {
  waiting: 0,
  error: 1,
  done: 2,
  retrying: 3,
  running: 3,
  idle: 4,
};

const WORD: Partial<Record<SessionStatus, string>> = {
  waiting: 'Asks you',
  error: 'Failed',
  done: 'New reply',
  retrying: 'Retrying',
  running: 'Running',
};

const NEEDS_YOU = new Set<SessionStatus>(['waiting', 'error', 'done']);

/**
 * Above the hub's chat: its open threads with their live status, what needs
 * you first (docs/hub.md). A thread is a session the hub started, or any
 * session that asks or failed, since the hub hears of those too.
 */
export default function HubBoard(props: { hubId: string }) {
  const sessions = useSessions();
  const projects = useProjects();
  const threads = createMemo(
    () =>
      sessions()
        .filter(
          (s) =>
            !s.archivedAt &&
            s.id !== props.hubId &&
            (s.startedBy === props.hubId ||
              s.status === 'waiting' ||
              s.status === 'error'),
        )
        .sort(
          (a, b) =>
            RANK[a.status] - RANK[b.status] || b.updatedAt - a.updatedAt,
        ),
    { name: 'hubThreads' },
  );
  const needsYou = () => threads().filter((s) => NEEDS_YOU.has(s.status));
  const running = () =>
    threads().filter((s) => s.status === 'running' || s.status === 'retrying');
  const where = (s: SessionSummary) => {
    const p = projects().find((p) => p.id === s.projectId);
    return p && s.cwd ? workspaceName(p, s.cwd) : undefined;
  };

  return (
    <Show when={threads().length}>
      <details
        class="group/board expand shrink-0 border-t border-line"
        open={
          typeof localStorage === 'undefined' ||
          localStorage.getItem('tau.hubBoardOpen') !== '0'
        }
        onToggle={(e) =>
          localStorage.setItem(
            'tau.hubBoardOpen',
            e.currentTarget.open ? '1' : '0',
          )
        }
      >
        <summary class="chat-column flex h-10 items-center gap-2 text-meta text-muted hover:text-fg touch:h-11">
          <span class="transition-transform group-open/board:rotate-90">
            <ChevronIcon />
          </span>
          <span class="font-medium text-fg">Threads</span>
          <span class="min-w-0 flex-1 truncate">
            {[
              needsYou().length && `${needsYou().length} need you`,
              running().length && `${running().length} running`,
              `${threads().length} open`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </summary>
        <ul class="chat-column max-h-[38dvh] overflow-y-auto overscroll-contain pb-2">
          <For each={threads()} keyed={(s) => s.id}>
            {(s) => (
              <li>
                <a
                  class={[
                    '-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-hover touch:py-2.5',
                    s().status === 'idle' && 'text-muted',
                  ]}
                  href={paths.s(s().id)()}
                  title={[s().title, where(s())].filter(Boolean).join('\n')}
                >
                  <StatusDot status={s().status} />
                  <span
                    class={[
                      'min-w-0 flex-1 truncate',
                      NEEDS_YOU.has(s().status) && 'font-semibold',
                    ]}
                  >
                    {s().title || 'New session'}
                  </span>
                  <Show when={where(s())}>
                    {(w) => (
                      <span class="max-w-[35%] shrink truncate text-meta text-muted max-sm:hidden">
                        {w()}
                      </span>
                    )}
                  </Show>
                  <span
                    class={[
                      'shrink-0 text-meta tabular-nums',
                      s().status === 'waiting'
                        ? 'text-accent'
                        : s().status === 'error'
                          ? 'text-danger'
                          : 'text-muted',
                    ]}
                  >
                    {[WORD[s().status], timeAgo(s().updatedAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </a>
              </li>
            )}
          </For>
        </ul>
      </details>
    </Show>
  );
}
