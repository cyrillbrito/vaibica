import { useLocation, useNavigate } from '@solidjs/router';
import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';

import { arriveOnChange } from '../ui/arrive';
import { copyText } from '../ui/clipboard';
import { closeDrawer } from '../ui/layout';
import {
  CHATS_ID,
  removeWorktree,
  reorderProjects,
  pinProject,
  setCurrentTarget,
  useProjects,
  workspaceName,
  type Target,
} from '../projects/projects';
import type { SessionStatus, SessionSummary } from '@bica/shared/protocol';
import {
  archiveSession,
  forkSession,
  markSeen,
  useHub,
  useSessions,
} from '../sessions/sessions';
import { createTerminal, useTerminals } from '../terminals/terminals';
import TerminalRow from '../terminals/TerminalRow';
import { useChimes } from '../ui/sound';
import { useBadge } from '../ui/badge';
import { setTheme, theme } from '../ui/theme';
import { age } from '../ui/time';
import { kept, openInEditor, workspaceHref } from '../files/files';
import KeptFileRow, { isOpenKept } from '../files/KeptFileRow';
import { paths } from '../router';
import { IconButton } from '../ui/Button';
import {
  contextMenu,
  MenuButton,
  openContextMenu,
  type MenuEntry,
} from '../ui/ContextMenu';
import { createFlip } from '../ui/flip';
import { createSortable, type Drag } from '../ui/sortable';
import { Segmented, SegmentCount, segmentClass } from '../ui/Segmented';
import {
  ArchiveIcon,
  BranchIcon,
  ChevronsUpDownIcon,
  CloseIcon,
  CommandIcon,
  CodeIcon,
  CopyIcon,
  DeleteIcon,
  DiffIcon,
  FolderIcon,
  ExternalIcon,
  ForkIcon,
  HubIcon,
  InboxIcon,
  MoonIcon,
  PencilIcon,
  PlusIcon,
  ReadIcon,
  RestoreIcon,
  ParentIcon,
  SessionIcon,
  SettingsIcon,
  SunIcon,
  SystemThemeIcon,
  TerminalIcon,
  UnreadIcon,
  PinIcon,
} from '../ui/icons';
import BranchName from '../projects/BranchName';
import PlanUsage from '../models/PlanUsage';
import PullRequestBadge from '../projects/PullRequestBadge';
import { openPalette } from './CommandPalette';
import { openProjectPicker } from '../projects/ProjectPicker';
import { archiveWithChildren } from '../sessions/ArchiveDialog';
import { Logo } from '../ui/Logo';
import StatusDot, { StatusTag } from '../sessions/StatusDot';
import { Tag } from '../ui/Tag';
import Divider, { dividerClass } from '../ui/Divider';
import { toast } from '../ui/Toast';
import TitleInput from '../sessions/TitleInput';
import {
  bySection,
  nameOf,
  workspaceGroups,
  type Group,
} from './sidebar-groups';

// The one indent step under a project or list heading, with a guide line.
const INDENT = 'ml-2.5 border-l border-line pl-1';
// Where a dragged project would land, between two projects.
const DROP_LINE =
  "before:absolute before:inset-x-2 before:h-0.5 before:rounded-full before:bg-muted before:content-['']";

// Hover-only actions on a workspace row; always shown on touch.
const REVEAL =
  'invisible group-focus-within:visible group-hover:visible touch:visible';

// The inbox tabs on top, after affectUI's Agent Inbox. Needs you: waiting on
// an answer, failed, unread, or running: everything still in play. A session
// that moved in the last 10 minutes stays too, since you likely just read it.
type Filter = 'all' | 'needs';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs', label: 'Needs you' },
];
const NEEDS: SessionStatus[] = [
  'waiting',
  'error',
  'done',
  'running',
  'retrying',
];
const RECENT = 10 * 60_000;

// The branch, else what stands in for it.
function WorkspaceLabel(props: { group: Group; class?: string }) {
  return (
    <Show
      when={props.group.branch}
      fallback={
        <span class={['flex min-w-0 items-center gap-1', props.class]}>
          <span class="min-w-0 truncate">{props.group.folder}</span>
          {/* Its own span, so a long folder name can't push it out of sight. */}
          <Show when={props.group.note}>
            <span class="shrink-0 text-muted">
              {props.group.folder && '· '}
              {props.group.note}
            </span>
          </Show>
        </span>
      }
    >
      {(branch) => (
        <BranchName
          branch={branch()}
          tickets={props.group.tickets}
          class={props.class}
        />
      )}
    </Show>
  );
}

export default function Sidebar() {
  const sessions = useSessions();
  useChimes(sessions);
  useBadge(sessions);
  const projects = useProjects();
  const terminals = useTerminals();
  const navigate = useNavigate();
  const location = useLocation();
  const [renaming, setRenaming] = createSignal<string>();
  // Listed on its own at the top, not under a project.
  const hub = useHub();

  const groups = createMemo(
    () => {
      const list = sessions().filter(
        (s) => !s.archivedAt && s.id !== hub()?.id,
      );
      return workspaceGroups(projects(), terminals(), kept(), list);
    },
    { name: 'sidebarGroups' },
  );

  // Workspaces with nothing open (often a PR waiting on review) shrink to one
  // line in Parked, so the list above is only what's in progress.
  const isParked = (g: Group) =>
    !g.pinned && !g.sessions.length && !g.terminals.length && !g.files.length;
  const active = createMemo(() => groups().filter((g) => !isParked(g)), {
    name: 'activeGroups',
  });
  const parked = createMemo(() => groups().filter(isParked), {
    name: 'parkedGroups',
  });
  // The open session is being read; the server catches up a moment later.
  const isOpen = (s: SessionSummary) => location.pathname === paths.s(s.id)();
  const statusOf = (s: SessionSummary) =>
    s.status === 'done' && isOpen(s) ? 'idle' : s.status;
  // Ticks each minute so recent sessions leave Needs you on time.
  const [now, setNow] = createSignal(Date.now(), { name: 'sidebarMinute' });
  const minute = setInterval(() => setNow(Date.now()), 60_000);
  onCleanup(() => clearInterval(minute));
  const inFilter = (f: Filter, s: SessionSummary) =>
    f === 'all' || NEEDS.includes(statusOf(s)) || now() - s.updatedAt < RECENT;

  const [filter, setFilter] = createSignal<Filter>('all', {
    name: 'sidebarFilter',
  });
  // Pointing at a tab fades the rows it would leave out.
  const [peek, setPeek] = createSignal<Filter | undefined>(undefined, {
    name: 'sidebarPeek',
  });
  const live = createMemo(
    () => sessions().filter((s) => !s.archivedAt && s.id !== hub()?.id),
    {
      name: 'liveSessions',
    },
  );
  const count = (f: Filter) => live().filter((s) => inFilter(f, s)).length;
  // A filter keeps only matching sessions, plus the open one, so the row
  // you are reading doesn't vanish under you once it's marked read.
  const sections = createMemo(
    () => {
      const f = filter();
      if (f === 'all') return bySection(active());
      return bySection(
        active()
          .map((g) => ({
            ...g,
            terminals: [],
            files: [],
            sessions: g.sessions.filter((s) => isOpen(s) || inFilter(f, s)),
          }))
          .filter((g) => g.sessions.length),
      );
    },
    { name: 'sidebarSections' },
  );
  // A dropped project's new order of projects, until the server has it.
  const [savingOrder, setSavingOrder] = createSignal<string[] | undefined>(
    undefined,
    { name: 'savingProjectOrder' },
  );
  // Chats and No project stay last.
  const movable = (key: string) => key !== CHATS_ID && key !== '';
  const ordered = createMemo(
    () => {
      const order = savingOrder();
      if (!order) return sections();
      const rank = new Map(order.map((key, i) => [key, i]));
      const last = order.length;
      return [...sections()].sort(
        (a, b) => (rank.get(a.key) ?? last) - (rank.get(b.key) ?? last),
      );
    },
    { name: 'orderedSections' },
  );
  const shownMovable = () =>
    ordered()
      .map((s) => s.key)
      .filter(movable);
  // Where a drop lands: before a project, or after the last one, since
  // Chats stays last. Undefined: right where it already is.
  const dropAt = (drag: Drag) => {
    const shown = shownMovable();
    const before =
      drag.before && movable(drag.before) ? drag.before : undefined;
    const after = before ? undefined : shown.at(-1);
    const at = shown.indexOf(drag.id);
    if (before === drag.id || before === shown[at + 1] || after === drag.id)
      return undefined;
    return before
      ? { key: before, side: 'before' as const }
      : after
        ? { key: after, side: 'after' as const }
        : undefined;
  };
  const sortable = createSortable({
    onDrop: (id, before) => {
      const at = dropAt({ id, before, top: 0, left: 0, width: 0 });
      if (!at) return;
      // Only the dragged project moves, so projects the list hides (parked,
      // filtered out) keep their places.
      const next = projects()
        .map((p) => p.id)
        .filter((p) => movable(p) && p !== id);
      const i = next.indexOf(at.key);
      next.splice(at.side === 'before' ? i : i + 1, 0, id);
      setSavingOrder(next);
      reorderProjects(next)
        .catch((e) => toast.error(e))
        .finally(() => setSavingOrder(undefined));
    },
  });
  const drop = createMemo(
    () => {
      const d = sortable.drag();
      return d && dropAt(d);
    },
    { name: 'projectDrop' },
  );
  const parkedSections = createMemo(() => bySection(parked()), {
    name: 'parkedSections',
  });
  const parkedOpen = () => localStorage.getItem('bica.parkedOpen') !== '0';

  const archived = createMemo(() => sessions().filter((s) => s.archivedAt), {
    name: 'archivedSessions',
  });
  const [archivedOpen, setArchivedOpen] = createSignal(false, {
    name: 'archivedOpen',
  });

  // The workspace a session ran in, for the archived list.
  const whereOf = (s: SessionSummary) => {
    const project = projects().find((p) => p.id === s.projectId);
    if (!project) return undefined;
    if (s.cleanedUp?.branch) return `${project.name} / ${s.cleanedUp.branch}`;
    return s.cwd ? workspaceName(project, s.cwd) : project.name;
  };

  const archive = (s: SessionSummary) =>
    archiveWithChildren(s, sessions(), (ids) => {
      // Leave a session that's about to vanish from the list.
      if (ids.some((id) => location.pathname === paths.s(id)()))
        navigate(paths());
    });

  // Sessions picked with ⌘ or shift click, for acting on many at once.
  const [selectedIds, setSelectedIds] = createSignal<string[]>([], {
    name: 'selectedSessions',
  });
  // Ids of sessions gone from the list drop out on their own.
  const selected = createMemo(
    () => sessions().filter((s) => selectedIds().includes(s.id)),
    { name: 'selectedSummaries' },
  );
  const isSelected = (id: string) => selectedIds().includes(id);
  const clearSelection = () => setSelectedIds([]);
  // Where a shift click range starts: the last row clicked without shift.
  let anchor: string | undefined;

  // The rows in the order they're drawn; a range never mixes the two lists.
  const rowOrder = (archivedRows: boolean) =>
    archivedRows
      ? archived()
      : sections().flatMap((s) => s.groups.flatMap((g) => g.sessions));

  const clickRow = (e: MouseEvent, s: SessionSummary, archivedRow = false) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      // The open session counts as picked when the first ⌘ click starts a selection.
      const open = sessions().find(
        (o) =>
          location.pathname === paths.s(o.id)() &&
          !!o.archivedAt === archivedRow,
      );
      setSelectedIds((ids) => {
        const base = !ids.length && open && open.id !== s.id ? [open.id] : ids;
        return base.includes(s.id)
          ? base.filter((id) => id !== s.id)
          : [...base, s.id];
      });
      anchor = s.id;
      return;
    }
    if (e.shiftKey) {
      e.preventDefault();
      const order = rowOrder(archivedRow).map((o) => o.id);
      const open = order.find((id) => location.pathname === paths.s(id)());
      const from = order.indexOf(anchor ?? open ?? s.id);
      const to = order.indexOf(s.id);
      if (from < 0) {
        setSelectedIds([s.id]);
        anchor = s.id;
        return;
      }
      setSelectedIds(order.slice(Math.min(from, to), Math.max(from, to) + 1));
      return;
    }
    clearSelection();
    anchor = s.id;
    closeDrawer();
  };

  const archiveSelected = async (list: SessionSummary[]) => {
    const busy = (s: SessionSummary) =>
      s.status === 'running' || s.status === 'retrying';
    const ready = list.filter((s) => !s.archivedAt && !busy(s));
    const skipped = list.filter((s) => !s.archivedAt && busy(s)).length;
    clearSelection();
    if (ready.some((s) => location.pathname === paths.s(s.id)()))
      navigate(paths());
    await Promise.allSettled(ready.map((s) => archiveSession(s.id)));
    toast(
      `Archived ${ready.length} session${ready.length === 1 ? '' : 's'}` +
        (skipped ? `, skipped ${skipped} still running` : ''),
    );
  };

  const unarchiveSelected = async (list: SessionSummary[]) => {
    clearSelection();
    await Promise.allSettled(
      list.filter((s) => s.archivedAt).map((s) => archiveSession(s.id, false)),
    );
  };

  const selectionMenu = (list: SessionSummary[]): MenuEntry[] => {
    const active = list.filter((s) => !s.archivedAt);
    const gone = list.length - active.length;
    return [
      ...(active.length
        ? ([
            {
              label: `Archive ${active.length} sessions`,
              icon: <ArchiveIcon />,
              disabled:
                active.every(
                  (s) => s.status === 'running' || s.status === 'retrying',
                ) && 'All still running',
              onSelect: () => void archiveSelected(list),
            },
          ] satisfies MenuEntry[])
        : []),
      ...(gone
        ? ([
            {
              label: `Unarchive ${gone} sessions`,
              icon: <RestoreIcon />,
              onSelect: () => void unarchiveSelected(list),
            },
          ] satisfies MenuEntry[])
        : []),
      'separator',
      {
        label: 'Clear selection',
        icon: <CloseIcon />,
        onSelect: clearSelection,
      },
    ];
  };

  const markUnread = (s: SessionSummary) => {
    // The open session marks itself read again right away.
    if (location.pathname === paths.s(s.id)()) navigate(paths());
    void markSeen(s.id, false);
  };

  // Right click on one of several picked rows acts on all of them.
  const rowMenu = (s: SessionSummary): MenuEntry[] =>
    selected().length > 1 && isSelected(s.id)
      ? selectionMenu(selected())
      : sessionMenu(s);

  const sessionMenu = (s: SessionSummary): MenuEntry[] => [
    ...(s.archivedAt
      ? []
      : s.status === 'done'
        ? [
            {
              label: 'Mark as read',
              icon: <ReadIcon />,
              onSelect: () => void markSeen(s.id),
            },
          ]
        : s.status === 'idle'
          ? [
              {
                label: 'Mark as unread',
                icon: <UnreadIcon />,
                onSelect: () => markUnread(s),
              },
            ]
          : []),
    {
      label: 'Rename',
      icon: <PencilIcon />,
      onSelect: () => setRenaming(s.id),
    },
    {
      label: 'Fork',
      icon: <ForkIcon />,
      onSelect: () =>
        void forkSession(s.id).then((id) => {
          closeDrawer();
          navigate(paths.s(id)());
        }),
    },
    s.archivedAt
      ? {
          label: 'Unarchive',
          icon: <RestoreIcon />,
          onSelect: () => void archiveSession(s.id, false),
        }
      : {
          label: 'Archive',
          icon: <ArchiveIcon />,
          // Hidden but still spending tokens would be a surprise.
          disabled:
            (s.status === 'running' || s.status === 'retrying') &&
            'Still running',
          onSelect: () => void archive(s),
        },
    'separator',
    {
      label: 'Open in new tab',
      icon: <ExternalIcon />,
      onSelect: () => window.open(paths.s(s.id)(), '_blank'),
    },
    {
      label: 'Copy session ID',
      icon: <CopyIcon />,
      onSelect: () => void copyText(s.id),
    },
  ];

  const workspaceMenu = (g: Group): MenuEntry[] => [
    ...(g.target
      ? ([
          {
            label: 'New session here',
            icon: <PlusIcon />,
            onSelect: () => newSession(g.target!),
          },
          {
            label: 'New terminal here',
            icon: <TerminalIcon />,
            onSelect: () => void newTerminal(g.target!),
          },
          {
            label: 'Files and changes',
            icon: <DiffIcon />,
            onSelect: () => {
              closeDrawer();
              navigate(
                workspaceHref({
                  projectId: g.target!.projectId,
                  cwd: g.target!.cwd!,
                }),
              );
            },
          },
          {
            label: 'Open in editor',
            icon: <CodeIcon />,
            onSelect: () =>
              void openInEditor({
                projectId: g.target!.projectId,
                cwd: g.target!.cwd!,
              }),
          },
        ] satisfies MenuEntry[])
      : []),
    ...(g.target && !g.worktree && g.projectKey !== CHATS_ID
      ? ([
          {
            label: g.pinned ? 'Unpin project' : 'Pin project',
            icon: <PinIcon />,
            onSelect: () =>
              void pinProject(g.projectKey, !g.pinned).catch((e) =>
                toast.error(e),
              ),
          },
        ] satisfies MenuEntry[])
      : []),
    ...(g.path
      ? ([
          ...(g.target ? (['separator'] as const) : []),
          {
            label: 'Copy path',
            icon: <CopyIcon />,
            onSelect: () => void copyText(g.path!),
          },
        ] satisfies MenuEntry[])
      : []),
    ...(g.target && g.worktree
      ? ([
          'separator',
          {
            label: 'Remove worktree',
            icon: <DeleteIcon />,
            onSelect: () => void remove(g),
          },
        ] satisfies MenuEntry[])
      : []),
  ];

  // Merged or closed: the server's check for unsaved work is the only question.
  const remove = async (g: Group) => {
    const { projectId, cwd } = g.target!;
    const label = nameOf(g);
    const done = g.pr?.state === 'merged' || g.pr?.state === 'closed';
    if (
      !done &&
      !confirm(
        `Remove ${label}? Its folder and local branch are deleted, and its sessions archived.`,
      )
    )
      return;
    try {
      const risk = await removeWorktree(projectId, cwd!);
      if (risk) {
        if (!confirm(`${label} has ${risk}. Delete it anyway? They are lost.`))
          return;
        await removeWorktree(projectId, cwd!, true);
      }
      if (
        location.pathname + location.search ===
        workspaceHref({ projectId, cwd: cwd! })
      )
        navigate(paths());
      toast(`Removed ${label}`);
    } catch (e) {
      toast.error(e);
    }
  };

  const newTerminal = async (target: Target) => {
    closeDrawer();
    const id = await createTerminal({
      projectId: target.projectId,
      cwd: target.cwd!,
    });
    navigate(paths.t(id)());
  };

  const newSession = (target: Target) => {
    setCurrentTarget(target);
    closeDrawer();
    navigate(paths());
  };

  // The one action a workspace row shows: hidden until hover, but its room is
  // kept, so nothing on the row moves. The rest is in the row's menu.
  const NewSessionButton = (p: { group: Group }) => (
    <Show when={!!p.group.target}>
      <IconButton
        size="sm"
        class={REVEAL}
        title={`New session in ${nameOf(p.group)}`}
        onClick={() => newSession(p.group.target!)}
      >
        <PlusIcon />
      </IconButton>
    </Show>
  );

  const ParkedRow = (p: { group: Group; project?: boolean }) => {
    const g = () => p.group;
    return (
      <li
        data-flip={`pk:${g().key}`}
        class="group context-target flex items-center gap-1 rounded-md pr-0.5 transition-colors hover:bg-hover"
        {...contextMenu(() => workspaceMenu(g()))}
      >
        <a
          class="flex min-w-0 flex-1 items-center gap-2 py-1 pl-2 touch:py-3"
          href={workspaceHref({
            projectId: g().target!.projectId,
            cwd: g().target!.cwd!,
          })}
          title={[g().path, g().note].filter(Boolean).join('\n')}
          onClick={closeDrawer}
        >
          <Show when={p.project}>
            <span class="min-w-0 truncate text-muted">{g().projectName}</span>
          </Show>
          <WorkspaceLabel group={g()} class="text-meta" />
        </a>
        <Show when={g().pr}>{(pr) => <PullRequestBadge pr={pr()} />}</Show>
        <Show
          when={
            g().worktree &&
            (g().pr?.state === 'merged' || g().pr?.state === 'closed')
          }
        >
          <IconButton
            size="sm"
            title="Remove worktree: delete the folder and local branch"
            onClick={() => void remove(g())}
          >
            <DeleteIcon />
          </IconButton>
        </Show>
        <NewSessionButton group={g()} />
      </li>
    );
  };

  // The workspace's branch and PR. Alone in its project, the project's name
  // sits on a line above, so the branch keeps the full width.
  const WorkspaceHeader = (p: { group: Group; project?: string }) => {
    const g = () => p.group;
    const branchLine = () => (
      <div
        class="flex min-w-0 flex-1 items-center gap-2"
        title={[g().path, g().note].filter(Boolean).join('\n')}
      >
        <Show when={!p.project}>
          {/* Centered on the status dots below it. */}
          <span class="-ml-0.5 grid text-muted [&_svg]:size-3.5">
            <BranchIcon />
          </span>
        </Show>
        <WorkspaceLabel group={g()} class="text-meta text-muted" />
        <Show when={g().pr}>{(pr) => <PullRequestBadge pr={pr()} />}</Show>
      </div>
    );
    const href = () =>
      g().target?.cwd
        ? workspaceHref({
            projectId: g().target!.projectId,
            cwd: g().target!.cwd!,
          })
        : undefined;
    // Lit while its page is open, unless one of its kept files is the open row.
    const open = () =>
      !!g().target?.cwd &&
      location.pathname === paths.p(g().target!.projectId)() &&
      new URLSearchParams(location.search).get('w') === g().target!.cwd &&
      !g().files.some((k) => isOpenKept(k, location));
    return (
      <div
        data-flip={`w:${g().key}`}
        // The fill spans the whole row, + included, so it reads as one row.
        class={[
          'context-target flex items-center gap-1 rounded-md pr-0.5 transition-colors',
          href() && 'hover:bg-hover',
          open() && 'bg-active',
        ]}
        {...contextMenu(() => workspaceMenu(g()))}
        // Alone in its project, this is the project's header: it drags the project.
        data-drag-handle={
          (p.project && g().projectKey !== CHATS_ID && g().projectKey) ||
          undefined
        }
      >
        <a
          draggable="false"
          class="flex min-w-0 flex-1 flex-col justify-center pl-2 pr-1"
          href={href()}
          title={
            href() ? `Open ${nameOf(g())}: files, changes and Git` : undefined
          }
          onClick={closeDrawer}
        >
          <div class="flex min-h-7 items-center">
            <Show when={p.project} fallback={branchLine()}>
              <h2 class="min-w-0 flex-1 truncate font-semibold">{p.project}</h2>
            </Show>
          </div>
          {/* Alone, a plain main folder or one without git says nothing new. */}
          <Show
            when={
              p.project &&
              (g().branch || g().note) &&
              !(
                !g().folder &&
                (g().note === 'no git' ||
                  (!g().note && ['main', 'master'].includes(g().branch!)))
              )
            }
          >
            <div class="-mt-1 flex pb-0.5">{branchLine()}</div>
          </Show>
        </a>
        <NewSessionButton group={g()} />
      </div>
    );
  };

  const WorkspaceRows = (p: { group: Group; nested?: boolean }) => (
    <ul class={!p.nested && INDENT}>
      <For each={p.group.terminals} keyed={(t) => t.id}>
        {(t) => <TerminalRow terminal={t()} />}
      </For>
      <For each={p.group.files} keyed={(k) => k.path}>
        {(k) => <KeptFileRow file={k()} files={p.group.files} />}
      </For>
      <For
        each={p.group.sessions}
        // Every snapshot is new objects; keep rows by id.
        keyed={(s) => s.id}
      >
        {(s) => <SessionRow session={s()} />}
      </For>
    </ul>
  );

  // Archived rows: no status, muted, and the time they were archived.
  const SessionRow = (p: { session: SessionSummary; archived?: boolean }) => {
    const s = () => p.session;
    const titleRef = arriveOnChange(() => s().title);
    const dim = () => {
      const f = peek();
      return !p.archived && !!f && !inFilter(f, s());
    };
    return (
      <li
        data-flip={`s:${s().id}`}
        class={['transition-opacity duration-150', dim() && 'opacity-40']}
      >
        <Show
          when={renaming() === s().id}
          fallback={
            <div
              class="context-target relative rounded-md"
              {...contextMenu(() => rowMenu(s()))}
            >
              <a
                class={[
                  'flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-hover data-active:bg-active touch:py-3 touch:pr-11',
                  p.archived && 'text-muted hover:text-fg',
                  isSelected(s().id) && 'bg-accent/15! hover:bg-accent/20!',
                ]}
                href={paths.s(s().id)}
                title={
                  [s().title, p.archived && whereOf(s())]
                    .filter(Boolean)
                    .join('\n') || undefined
                }
                // Shift would also select the text it passes over.
                onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                onClick={(e) => clickRow(e, s(), p.archived)}
                onDblClick={() => setRenaming(s().id)}
              >
                <Show when={!p.archived}>
                  <StatusDot status={statusOf(s())} />
                </Show>
                {/* dir="auto": a right-to-left title keeps its start, not its end. */}
                <span
                  ref={titleRef}
                  dir="auto"
                  class={[
                    'flex-1 truncate text-left',
                    !p.archived && statusOf(s()) === 'idle' && 'text-muted',
                    !p.archived &&
                      ['done', 'waiting'].includes(statusOf(s())) &&
                      'font-medium',
                  ]}
                >
                  {s().title || '…'}
                </span>
                <Show when={!p.archived && s().parentDrives}>
                  <span
                    class="text-accent-ink [&_svg]:size-3.5"
                    title="Its parent session is in charge"
                  >
                    <ParentIcon />
                  </span>
                </Show>
                <Show when={p.archived && s().cleanedUp?.pr}>
                  {(pr) => <PullRequestBadge pr={pr()} plain />}
                </Show>
                <Show
                  when={!p.archived}
                  fallback={
                    <span class="text-meta text-muted tabular-nums">
                      {age(s().archivedAt!)}
                    </span>
                  }
                >
                  <Show
                    when={s().tonight}
                    fallback={
                      <StatusTag
                        status={statusOf(s())}
                        since={s().runningSince}
                        updatedAt={s().updatedAt}
                      />
                    }
                  >
                    <Tag tone="accent" title="Held for tonight's run">
                      <MoonIcon />
                      Tonight
                    </Tag>
                  </Show>
                </Show>
              </a>
              <MenuButton
                class="absolute inset-y-0 right-0.5 my-auto hidden touch:grid"
                items={() => rowMenu(s())}
              />
            </div>
          }
        >
          <div
            class={[
              'flex items-center gap-2 rounded-md bg-active py-0.5 pr-1 touch:py-2',
              p.archived ? 'pl-1' : 'pl-2',
            ]}
          >
            <Show when={!p.archived}>
              <StatusDot status={statusOf(s())} />
            </Show>
            <TitleInput
              id={s().id}
              value={s().title}
              onClose={() => setRenaming(undefined)}
              class="py-0.5"
            />
          </div>
        </Show>
      </li>
    );
  };

  // Rows glide when the list's order changes: a new session, one archived,
  // a workspace back from Parked, a filter picked. Not on every snapshot.
  let list: HTMLDivElement | undefined;
  const order = createMemo(
    () =>
      [
        filter(),
        archivedOpen(),
        ...ordered().flatMap((s) =>
          s.groups.flatMap((g) => [
            g.key,
            ...g.terminals.map((t) => t.id),
            ...g.files.map((k) => k.path),
            ...g.sessions.map((s) => s.id),
          ]),
        ),
        ...parked().map((g) => g.key),
        archived().length,
      ].join('\n'),
    { name: 'sidebarOrder' },
  );
  createFlip(() => list, order, sortable.dragging);

  const THEMES = {
    system: ['Light theme', 'light', SunIcon],
    light: ['Dark theme', 'dark', MoonIcon],
    dark: ['System theme', 'system', SystemThemeIcon],
  } as const;

  // The Bica button's menu, in the place of App Shell's workspace switcher.
  const appMenu = (): MenuEntry[] => {
    const [label, next, Icon] = THEMES[theme()];
    return [
      {
        label: 'New session',
        icon: <SessionIcon />,
        onSelect: () => {
          closeDrawer();
          navigate(paths());
        },
      },
      {
        label: 'Add project',
        icon: <FolderIcon />,
        onSelect: () => {
          closeDrawer();
          openProjectPicker();
        },
      },
      'separator',
      {
        label: 'Settings',
        icon: <SettingsIcon />,
        onSelect: () => {
          closeDrawer();
          navigate(paths.settings());
        },
      },
      { label, icon: <Icon />, onSelect: () => setTheme(next) },
    ];
  };

  return (
    <nav
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-line bg-panel pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]"
      aria-label="Sessions"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && selectedIds().length) {
          e.stopPropagation();
          clearSelection();
        }
      }}
    >
      <header class="flex h-12 shrink-0 items-center gap-1 px-2">
        <button
          class="flex h-8 min-w-0 items-center gap-2 rounded-lg pr-1.5 pl-2 transition-colors hover:bg-hover data-menu-open:bg-active touch:h-11"
          aria-haspopup="menu"
          title="Bica menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openContextMenu(r.left, r.bottom + 4, appMenu(), e.currentTarget);
          }}
        >
          <Logo size={20} />
          <span class="font-semibold tracking-tight">Bica</span>
          <span class="text-muted [&_svg]:size-3.5">
            <ChevronsUpDownIcon />
          </span>
        </button>
        <span class="flex-1" />
        <IconButton
          title="Commands (⌘K)"
          onClick={() => {
            closeDrawer();
            openPalette();
          }}
        >
          <CommandIcon />
        </IconButton>
        <IconButton
          title="New session"
          onClick={() => {
            closeDrawer();
            navigate(paths());
          }}
        >
          <PlusIcon />
        </IconButton>
      </header>
      <Show when={live().length}>
        <div class="shrink-0 px-2 pb-2" onPointerLeave={() => setPeek()}>
          <Segmented class="w-full">
            <For each={FILTERS}>
              {(f) => (
                <button
                  type="button"
                  class={[segmentClass, 'flex-auto px-1.5 whitespace-nowrap']}
                  data-on={filter() === f.id || undefined}
                  aria-pressed={filter() === f.id ? 'true' : 'false'}
                  onClick={() => setFilter(f.id)}
                  onPointerEnter={() => setPeek(f.id)}
                  onFocus={() => setPeek(f.id)}
                  onBlur={() => setPeek()}
                >
                  {f.label}
                  {/* All's count says little and costs the room the others need. */}
                  <Show when={f.id !== 'all'}>
                    <SegmentCount value={count(f.id)} />
                  </Show>
                </button>
              )}
            </For>
          </Segmented>
        </div>
      </Show>
      <div
        ref={(el) => (list = el)}
        class="flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(--spacing(2),env(safe-area-inset-bottom))]"
      >
        {/* Chats is always listed, so it doesn't count as a project here. */}
        <Show
          when={
            projects().every((p) => p.id === CHATS_ID) && !sessions().length
          }
        >
          <button
            class="w-full rounded-lg px-2.5 py-2 text-left text-muted transition-colors hover:bg-hover hover:text-fg"
            onClick={openProjectPicker}
          >
            Add a project to start
          </button>
        </Show>
        <Show when={filter() !== 'all' && !sections().length}>
          <div class="appear flex flex-col items-center gap-2 px-4 pt-10 text-center text-muted">
            <span class="grid size-9 place-items-center rounded-full bg-hover">
              <InboxIcon />
            </span>
            Nothing needs you
          </div>
        </Show>
        {/* Always here, so the hub is one tap away even before it exists. */}
        <a
          class="mt-2 flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-hover aria-[current=page]:bg-active touch:py-3"
          href={paths.hub()}
          aria-current={location.pathname === paths.hub() ? 'page' : undefined}
          title="The hub: one session that coordinates the others"
          onClick={closeDrawer}
        >
          <span class="text-accent">
            <HubIcon />
          </span>
          <span class="flex-1 truncate font-semibold">Hub</span>
          <Show when={hub()}>
            {(h) => <StatusDot status={statusOf(h())} />}
          </Show>
        </a>
        <For each={ordered()} keyed={(s) => s.key}>
          {(s) => (
            <section
              ref={sortable.item(() => s().key)}
              // While a project drags, each shrinks to its header, so the
              // whole list fits and the drop line has short hops.
              class={[
                'relative',
                sortable.drag() ? 'my-2' : 'mt-2 mb-4',
                sortable.drag()?.id === s().key && 'opacity-40',
                drop()?.key === s().key &&
                  (drop()!.side === 'before'
                    ? DROP_LINE + ' before:-top-[5px]'
                    : DROP_LINE + ' before:-bottom-[5px]'),
              ]}
            >
              <Show
                when={s().groups.length > 1}
                fallback={
                  <div class="group">
                    <WorkspaceHeader group={s().groups[0]} project={s().name} />
                    <Show when={!sortable.drag()}>
                      <WorkspaceRows group={s().groups[0]} />
                    </Show>
                  </div>
                }
              >
                {/* Ellipsis needs a block: on the flex row it clipped mid-letter. */}
                <h2
                  data-flip={`p:${s().key}`}
                  data-drag-handle={movable(s().key) || undefined}
                  class="flex min-h-7 items-center pl-2 font-semibold"
                  title={s().name}
                >
                  <span class="min-w-0 truncate">{s().name}</span>
                </h2>
                {/* Branches add no indent of their own: each guide line, broken
                    between branches, shows which sessions are whose. */}
                <Show when={!sortable.drag()}>
                  <For each={s().groups} keyed={(g) => g.key}>
                    {(g) => (
                      <div class={['group', INDENT, 'mt-0.5 [&+&]:mt-2']}>
                        <WorkspaceHeader group={g()} />
                        <WorkspaceRows group={g()} nested />
                      </div>
                    )}
                  </For>
                </Show>
              </Show>
            </section>
          )}
        </For>
        {/* The dragged project's header, in the top layer so a drawer's
            transform can't offset it. */}
        <Show when={sortable.drag()}>
          {(d) => (
            <div
              popover="manual"
              ref={(el) =>
                requestAnimationFrame(() => el.isConnected && el.showPopover())
              }
              class="pointer-events-none fixed m-0 flex min-h-8 items-center rounded-lg border-0 bg-surface px-2 font-semibold text-fg shadow-sheet ring-1 ring-line"
              style={{
                inset: 'auto',
                top: `${d().top}px`,
                left: `${d().left}px`,
                width: `${d().width}px`,
              }}
            >
              <span class="min-w-0 truncate">
                {ordered().find((s) => s.key === d().id)?.name}
              </span>
            </div>
          )}
        </Show>
        <Show when={filter() === 'all' && parked().length}>
          <details
            class="group/parked expand mt-1 mb-3"
            open={parkedOpen()}
            onToggle={(e) =>
              localStorage.setItem(
                'bica.parkedOpen',
                e.currentTarget.open ? '1' : '0',
              )
            }
          >
            <summary data-flip="d:parked" class={[dividerClass, 'pr-1.5 pl-2']}>
              <Divider
                label="Parked"
                count={parked().length}
                chevron="group-open/parked:rotate-90"
              />
            </summary>
            {/* Like the list above: a project with several parked workspaces
                names them once. */}
            <ul class="mt-0.5">
              <For each={parkedSections()} keyed={(s) => s.key}>
                {(s) => (
                  <Show
                    when={s().groups.length > 1}
                    fallback={<ParkedRow group={s().groups[0]} project />}
                  >
                    <li
                      data-flip={`pl:${s().key}`}
                      class="px-2 pt-1 text-meta text-muted"
                    >
                      {s().name}
                    </li>
                    <For each={s().groups} keyed={(g) => g.key}>
                      {(g) => <ParkedRow group={g()} />}
                    </For>
                  </Show>
                )}
              </For>
            </ul>
          </details>
        </Show>
        <Show when={filter() === 'all' && archived().length}>
          <details
            class="group/archived expand mt-1 mb-3"
            onToggle={(e) => setArchivedOpen(e.currentTarget.open)}
          >
            <summary
              data-flip="d:archived"
              class={[dividerClass, 'pr-1.5 pl-2']}
            >
              <Divider
                label="Archived"
                count={archived().length}
                chevron="group-open/archived:rotate-90"
              />
            </summary>
            {/* Drawn only while open: it grows for good, and closed is the usual. */}
            <Show when={archivedOpen()}>
              <ul class="mt-0.5">
                <For each={archived()} keyed={(s) => s.id}>
                  {(s) => <SessionRow session={s()} archived />}
                </For>
              </ul>
            </Show>
          </details>
        </Show>
      </div>
      <Show when={selected().length > 1}>
        <div class="appear flex h-12 shrink-0 items-center gap-1 border-t border-line pr-2 pl-4">
          <span class="flex-1 text-muted tabular-nums">
            {selected().length} selected
          </span>
          <Show when={selected().some((s) => !s.archivedAt)}>
            <IconButton
              title="Archive selected"
              onClick={() => void archiveSelected(selected())}
            >
              <ArchiveIcon />
            </IconButton>
          </Show>
          <Show when={selected().some((s) => s.archivedAt)}>
            <IconButton
              title="Unarchive selected"
              onClick={() => void unarchiveSelected(selected())}
            >
              <RestoreIcon />
            </IconButton>
          </Show>
          <IconButton title="Clear selection (Esc)" onClick={clearSelection}>
            <CloseIcon />
          </IconButton>
        </div>
      </Show>
      <PlanUsage />
    </nav>
  );
}
