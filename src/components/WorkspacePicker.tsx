import { Dynamic, type JSX } from '@solidjs/web';
import { For, Show, createMemo, createSignal } from 'solid-js';

import { CHATS_ID, folderName, useProjects, type Target } from '#lib/projects';
import type { Project, PullRequest, Workspace } from '#lib/protocol';
import { useSessions } from '#lib/sessions';
import { age } from '#lib/time';
import BranchName from './BranchName';
import PullRequestBadge from './PullRequestBadge';
import { buttonClass } from './ui/Button';
import Chevron from './ui/Chevron';
import {
  BranchIcon,
  CheckIcon,
  FolderIcon,
  PlusIcon,
  SparkleIcon,
} from './ui/icons';
import Input from './ui/Input';
import Kbd from './ui/Kbd';

interface Item {
  key: string;
  target?: Target;
  // A plain line of text; a branch is shown with BranchName instead.
  label: string;
  // Muted before the label: the project, in Recent where no header names it.
  prefix?: string;
  branch?: string | null;
  tickets?: string;
  pr?: PullRequest | null;
  // The newest session there, archived or not.
  last?: number;
  icon: () => JSX.Element;
  hay: string;
  muted?: boolean;
  // A project's own row, its main folder, with the worktrees under it.
  head?: boolean;
  // A worktree under its project's row: no icon, the guide line says it.
  child?: boolean;
  // Its second action (+, or ⌘Enter): a new worktree in that project.
  fresh?: Target;
}

interface Group {
  id: string;
  label?: string;
  // A project: the first item is its row, the rest hang under it.
  project?: boolean;
  items: Item[];
}

const RECENT = 4;
let nextId = 0;

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Where a new session starts: a project's main folder, one of its worktrees, a
 * new worktree, or a chat. A popover with search on top, grouped by project,
 * the recent places first; a bottom sheet on the phone. Typing a branch,
 * folder, ticket, or pull request number finds it in any project.
 */
export default function WorkspacePicker(props: {
  project: Project;
  workspace: Workspace;
  worktree: boolean;
  onChange: (target: Target) => void;
  onAdd: () => void;
}) {
  const id = `workspace-picker-${++nextId}`;
  let popover: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  let list: HTMLDivElement | undefined;
  const projects = useProjects();
  const sessions = useSessions();
  const [query, setQuery] = createSignal('', { name: 'workspaceQuery' });
  const [active, setActive] = createSignal(0, { name: 'workspaceActive' });

  const lastByCwd = createMemo(
    () => {
      const map = new Map<string, number>();
      for (const s of sessions())
        if (s.cwd && (map.get(s.cwd) ?? 0) < s.updatedAt)
          map.set(s.cwd, s.updatedAt);
      return map;
    },
    { name: 'workspaceLast' },
  );

  const itemsOf = (p: Project): Item[] => {
    const workspace = (w: Workspace): Item => ({
      key: `w:${w.path}`,
      target: { projectId: p.id, cwd: w.path },
      label: folderName(w.path),
      branch: w.branch,
      tickets: p.tickets,
      pr: w.pr,
      last: lastByCwd().get(w.path),
      icon: BranchIcon,
      child: true,
      hay: [
        p.name,
        folderName(w.path),
        w.branch,
        w.pr && `#${w.pr.number} ${w.pr.number} ${w.pr.title}`,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    });
    const main = p.workspaces.find((w) => w.main);
    const canBranch = p.git;
    const head: Item = {
      key: `p:${p.id}`,
      target: { projectId: p.id, cwd: main?.path ?? p.path },
      label: p.name,
      pr: main?.pr,
      last: main && lastByCwd().get(main.path),
      icon: FolderIcon,
      head: true,
      fresh: canBranch
        ? { projectId: p.id, cwd: p.path, worktree: true }
        : undefined,
      hay: `${p.name} main folder${canBranch ? ' new worktree' : ''}`.toLowerCase(),
    };
    const rest = p.workspaces
      .filter((w) => !w.main)
      .map(workspace)
      .sort((a, b) => (b.last ?? 0) - (a.last ?? 0));
    return [head, ...rest];
  };

  const groups = createMemo(
    (): Group[] => {
      const q = words(query());
      const keep = (items: Item[]) =>
        items.filter((i) => q.every((w) => i.hay.includes(w)));
      // A matching worktree keeps its project's row, to say whose it is.
      const byProject = projects()
        .filter((p) => p.id !== CHATS_ID)
        .map((p): Group => {
          const [head, ...rest] = itemsOf(p);
          const found = keep(rest);
          return {
            id: p.id,
            project: true,
            items: found.length || keep([head]).length ? [head, ...found] : [],
          };
        });
      const chats = projects().find((p) => p.id === CHATS_ID);
      const other: Group = {
        id: 'other',
        items: keep([
          ...(chats
            ? [
                {
                  key: 'chat',
                  target: {
                    projectId: chats.id,
                    cwd: chats.path,
                    worktree: true,
                  },
                  label: 'New chat, no project',
                  icon: SparkleIcon,
                  hay: 'new chat no project',
                },
              ]
            : []),
          {
            key: 'add',
            label: 'Add project…',
            icon: FolderIcon,
            hay: 'add project folder repo',
            muted: true,
          },
        ]),
      };
      const all = byProject.flatMap((g) => g.items);
      const p = (i: Item) =>
        projects().find((p) => p.id === i.target?.projectId);
      const recent: Group = {
        id: 'recent',
        label: 'Recent',
        items:
          q.length || all.length <= 8
            ? []
            : all
                .filter((i) => i.last)
                .sort((a, b) => b.last! - a.last!)
                .slice(0, RECENT)
                .map((i) => ({
                  ...i,
                  key: `r:${i.key}`,
                  head: false,
                  child: false,
                  fresh: undefined,
                  prefix: i.head ? undefined : p(i)?.name,
                })),
      };
      const listed = byProject.filter((g) => g.items.length);
      if (recent.items.length && listed.length) listed[0].label = 'Projects';
      return [recent, ...listed, other].filter((g) => g.items.length);
    },
    { name: 'workspaceGroups' },
  );
  const flat = () => groups().flatMap((g) => g.items);
  const indexOf = createMemo(() => new Map(flat().map((i, n) => [i.key, n])), {
    name: 'workspaceIndex',
  });

  const isOn = (i: Item) =>
    !!i.target &&
    i.target.projectId === props.project.id &&
    (props.worktree
      ? !!i.target.worktree
      : !i.target.worktree && i.target.cwd === props.workspace.path);
  const freshOn = (i: Item) =>
    !!i.fresh && props.worktree && i.fresh.projectId === props.project.id;

  const choose = (i: Item | undefined, fresh = false) => {
    if (!i) return;
    const target = fresh ? i.fresh : i.target;
    if (fresh && !target) return;
    popover?.hidePopover();
    if (target) props.onChange(target);
    else props.onAdd();
  };

  const move = (to: number) => {
    const n = flat().length;
    if (!n) return;
    const next = (to + n) % n;
    setActive(next);
    list
      ?.querySelector(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const Row = (p: { item: Item }) => {
    const i = () => p.item;
    const index = () => indexOf().get(i().key) ?? -1;
    const lit = () => active() === index();
    const child = () => !!i().child;
    return (
      <div
        data-index={index()}
        class={[
          'flex min-h-8 w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-lg pr-2.5 pl-2.5 touch:min-h-11',
          lit() && 'bg-hover',
        ]}
        // A row, not a button: the + inside it is one. The search field
        // drives the keyboard, so rows never take focus.
        role="option"
        aria-selected={isOn(i()) ? 'true' : 'false'}
        onPointerMove={() => !lit() && setActive(index())}
        onClick={() => choose(i())}
      >
        <span class="flex min-w-0 flex-1 items-center gap-2.5">
          <Show when={!child()}>
            <span
              class={[
                'grid size-4 shrink-0 place-items-center [&_svg]:size-3.5',
                lit() ? 'text-fg' : 'text-muted',
              ]}
            >
              <Dynamic component={i().icon} />
            </span>
          </Show>
          <span
            class={[
              'flex min-w-0 flex-1 items-center gap-1.5',
              i().muted && !lit() && 'text-muted',
              !lit() && child() && 'text-fg/85',
            ]}
          >
            <Show when={i().prefix}>
              <span class="max-w-2/5 shrink-0 truncate text-muted">
                {i().prefix} /
              </span>
            </Show>
            <Show
              when={i().branch}
              fallback={
                <span
                  class={[
                    'truncate',
                    i().head && 'font-semibold',
                    child() && 'font-mono text-code',
                  ]}
                >
                  {i().label}
                </span>
              }
            >
              {(b) => (
                <BranchName
                  branch={b()}
                  tickets={i().tickets}
                  class="font-mono text-code"
                />
              )}
            </Show>
            <Show when={isOn(i())}>
              <span class="shrink-0 text-accent">
                <CheckIcon />
              </span>
            </Show>
          </span>
          <Show when={i().pr}>
            {(pr) => <PullRequestBadge pr={pr()} plain />}
          </Show>
        </span>
        <Show when={i().fresh}>
          <button
            type="button"
            tabindex="-1"
            class={[
              'flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-meta transition-colors hover:bg-active hover:text-fg touch:h-9 [&_svg]:size-3.5',
              freshOn(i())
                ? 'bg-accent/12 text-accent-ink'
                : lit()
                  ? 'text-fg'
                  : 'text-muted',
            ]}
            title={`A new worktree and branch in ${i().label}, named after the session`}
            aria-keyshortcuts="Meta+Enter"
            aria-pressed={freshOn(i()) ? 'true' : 'false'}
            onClick={(e) => {
              e.stopPropagation();
              choose(i(), true);
            }}
          >
            <PlusIcon />
            Worktree
            <Show when={lit() && !freshOn(i())}>
              <Kbd class="ml-0.5 h-4 min-w-4">⌘↵</Kbd>
            </Show>
          </button>
        </Show>
        <Show when={i().last}>
          {(t) => (
            <span class="w-7 shrink-0 text-right text-meta text-muted tabular-nums">
              {age(t())}
            </span>
          )}
        </Show>
      </div>
    );
  };

  const label = () => {
    const p = props.project;
    if (p.id === CHATS_ID) return 'New chat, no project';
    if (props.worktree) return `${p.name} / New worktree`;
    if (props.workspace.main) return p.name;
    return `${p.name} / ${folderName(props.workspace.path)}`;
  };

  return (
    <>
      <button
        type="button"
        popovertarget={id}
        class={[buttonClass({ size: 'lg' }), 'max-w-1/2 min-w-0 self-start']}
        style={{ 'anchor-name': `--${id}` }}
        aria-label="Workspace"
        title={
          props.project.id === CHATS_ID
            ? `A new empty folder in ${props.project.path}`
            : props.worktree
              ? 'A new worktree and branch, named after the session'
              : props.workspace.path
        }
      >
        <span class="truncate">{label()}</span>
        <Chevron class="rotate-90 text-muted/70" />
      </button>
      <div
        ref={(el) => (popover = el)}
        id={id}
        popover="auto"
        aria-label="Where to start"
        style={{ '--anchor': `--${id}` }}
        onToggle={(e) => {
          if (e.newState !== 'open') return;
          setQuery('');
          if (input) input.value = '';
          setActive(Math.max(0, flat().findIndex(isOn)));
          move(active());
          // On a phone the keyboard would cover the list.
          if (matchMedia('(pointer: fine)').matches) input?.focus();
        }}
        class={[
          'm-0 flex-col overflow-hidden bg-panel p-1 text-fg shadow-menu open:flex max-md:sheet max-md:shadow-sheet md:pop md:origin-top-left',
          'inset-x-0 top-auto bottom-0 w-full max-w-none rounded-t-tray pb-[env(safe-area-inset-bottom)] backdrop:bg-black/40',
          'md:inset-auto md:mt-1 md:w-96 md:rounded-tray md:pb-1 md:backdrop:bg-transparent md:[position-anchor:var(--anchor)] md:[position-area:bottom_span-right] md:[position-try-fallbacks:flip-block]',
        ]}
      >
        <div class="flex min-h-0 flex-col overflow-hidden rounded-sheet border border-line bg-surface">
          <div class="border-b border-line p-1.5">
            <Input
              ref={(el) => (input = el)}
              class="h-8 w-full touch:h-11"
              type="search"
              placeholder="Search projects, branches, pull requests…"
              autocomplete="off"
              spellcheck={false}
              onInput={(e) => {
                setQuery(e.currentTarget.value);
                move(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(active() + (e.key === 'ArrowDown' ? 1 : -1));
                } else if (e.key === 'Enter' && !e.isComposing) {
                  e.preventDefault();
                  choose(flat()[active()], e.metaKey || e.ctrlKey);
                }
              }}
            />
          </div>
          <div
            ref={(el) => (list = el)}
            role="listbox"
            aria-label="Workspaces"
            class="flex max-h-[60dvh] flex-col overflow-y-auto overscroll-contain p-1 md:max-h-[min(28rem,60dvh)]"
          >
            <Show when={!flat().length}>
              <p class="px-2.5 py-3 text-meta text-muted">Nothing matches.</p>
            </Show>
            <For each={groups()} keyed={(g) => g.id}>
              {(g, gi) => (
                <div class={['flex shrink-0 flex-col', gi() > 0 && 'mt-1.5']}>
                  <Show when={g().label}>
                    <div class="truncate px-2.5 pt-1 pb-1 text-meta text-muted">
                      {g().label}
                    </div>
                  </Show>
                  <Show when={!g().label && !g().project && gi() > 0}>
                    <div class="mx-2.5 mb-1.5 border-t border-line" />
                  </Show>
                  <Show
                    when={g().project}
                    fallback={
                      <For each={g().items} keyed={(i) => i.key}>
                        {(i) => <Row item={i()} />}
                      </For>
                    }
                  >
                    <Row item={g().items[0]} />
                    <Show when={g().items.length > 1}>
                      {/* A guide line, like the sidebar's, says whose they are. */}
                      <div class="ml-4.5 flex flex-col border-l border-line pl-1">
                        <For each={g().items.slice(1)} keyed={(i) => i.key}>
                          {(i) => <Row item={i()} />}
                        </For>
                      </div>
                    </Show>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </>
  );
}
