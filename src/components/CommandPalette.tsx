import { useLocation, useNavigate } from '@solidjs/router';
import { Dynamic, type JSX } from '@solidjs/web';
import {
  For,
  Loading,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
} from 'solid-js';

import { closeDrawer, toggleInspector, toggleSidebar } from '#lib/layout';
import {
  CHATS_ID,
  currentTarget,
  setCurrentTarget,
  useProjects,
  workspaceName,
  type Target,
} from '#lib/projects';
import type { SessionSummary } from '#lib/protocol';
import {
  archiveSession,
  forkSession,
  markSeen,
  renameSession,
  stopSession,
  useSessions,
} from '#lib/sessions';
import { provideCommands, runCommand } from '#lib/commands';
import { useCommands, useSlots } from '#lib/extensions';
import { setTheme, theme, type Theme } from '#lib/theme';
import { age } from '#lib/time';
import { useCurrentWorkspace, workspaceHref } from '#lib/workspace';
import { paths } from '../router';
import { openProjectPicker } from './ProjectPicker';
import { archiveWithChildren } from './ArchiveDialog';
import StatusDot from './StatusDot';
import { Button } from './ui/Button';
import {
  ArchiveIcon,
  ArrowDownIcon,
  BranchIcon,
  CheckIcon,
  ChevronIcon,
  FolderIcon,
  ForkIcon,
  HubIcon,
  InspectorIcon,
  KeyboardIcon,
  PencilIcon,
  PlusIcon,
  RestoreIcon,
  SearchIcon,
  SessionIcon,
  SettingsIcon,
  SidebarIcon,
  StopIcon,
  ThemeIcon,
  UnreadIcon,
} from './ui/icons';
import { toast } from './ui/Toast';

// `mod` is ⌘ on a Mac and Ctrl elsewhere; `ctrl` is Ctrl everywhere.
export interface Keys {
  code: string;
  mod?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

interface Command {
  id: string;
  label: string;
  // Muted text after the label, searched too.
  hint?: string;
  // Other words it should be found by: "chat" finds New session.
  words?: string;
  icon?: () => JSX.Element;
  keys?: Keys;
  // Right-aligned, when there are no keys: a session's age.
  meta?: string;
  group?: string;
  run?: () => void;
  page?: () => Page;
}

interface Page {
  title?: string;
  placeholder: string;
  // Gets the typed text as is; `raw` pages build their rows from it.
  items: (query: string) => Command[];
  raw?: boolean;
}

const KEY_NAMES: Record<string, string> = {
  ArrowDown: '↓',
  Backquote: '`',
  Slash: '/',
};

function keyLabel(k: Keys) {
  const key = KEY_NAMES[k.code] ?? k.code.replace(/^Key/, '');
  return `${k.ctrl ? '⌃' : ''}${k.alt ? '⌥' : ''}${k.shift ? '⇧' : ''}${k.mod ? '⌘' : ''}${key}`;
}

function matches(e: KeyboardEvent, k: Keys) {
  return (
    e.code === k.code &&
    (k.mod
      ? e.metaKey || e.ctrlKey
      : k.ctrl
        ? e.ctrlKey && !e.metaKey
        : !e.metaKey && !e.ctrlKey) &&
    !!k.alt === e.altKey &&
    !!k.shift === e.shiftKey
  );
}

const wordStart = (t: string, i: number) =>
  i === 0 || !/[\p{L}\p{N}]/u.test(t[i - 1]!);

// The word's letters in order from `from`, scored by how many sit together.
function letters(t: string, word: string, from: number) {
  let last = -2;
  let runs = 0;
  for (const ch of word) {
    const i = t.indexOf(ch, from);
    if (i < 0) return 0;
    if (i === last + 1) runs++;
    last = i;
    from = i + 1;
  }
  return 1 + Math.min(runs, 4);
}

// 0: no match. The whole word beats scattered letters, and starting on a word
// beats starting inside one, so the typo "nwe sess" still finds New session.
function score(text: string | undefined, word: string) {
  if (!text) return 0;
  const t = text.toLowerCase();
  const at = t.indexOf(word);
  if (at >= 0) return wordStart(t, at) ? 20 : 10;
  for (let i = t.indexOf(word[0]!); i >= 0; i = t.indexOf(word[0]!, i + 1))
    if (wordStart(t, i)) {
      const s = letters(t, word, i);
      if (s) return s + 4;
      break;
    }
  return letters(t, word, 0);
}

// Every typed word must match somewhere; the label counts double.
function rank(c: Command, words: string[]) {
  let total = 0;
  for (const w of words) {
    const best = Math.max(
      score(c.label, w) * 2,
      score(c.hint, w),
      score(c.words, w),
    );
    if (!best) return 0;
    total += best;
  }
  // On a tie, the shorter label is the closer match.
  return total - c.label.length / 1000;
}

// Answers first: these are why you came back.
const NEEDS_YOU: SessionSummary['status'][] = ['waiting', 'done', 'error'];

let dialog: HTMLDialogElement | undefined;
let input: HTMLInputElement | undefined;
const [stack, setStack] = createSignal<Page[]>([], { name: 'paletteStack' });
const [query, setQuery] = createSignal('', { name: 'paletteQuery' });
const [active, setActive] = createSignal(0, { name: 'paletteActive' });

/** Opens the palette at its root page. */
export function openPalette() {
  setStack([]);
  setQuery('');
  setActive(0);
  if (input) input.value = '';
  if (!dialog?.open) dialog?.showModal();
  input?.focus();
}

function closePalette() {
  dialog?.close();
}

// After the page changes, the new page's composer is the place to type.
function focusComposer() {
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLTextAreaElement>('main textarea[name=prompt]')
        ?.focus(),
    ),
  );
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useSessions();
  const projects = useProjects();
  const workspace = useCurrentWorkspace();
  // Extensions' commands and places (src/extensions/contract.ts).
  const commands = useCommands();
  const commandContext = () => ({
    workspace: workspace()?.ref,
    workspaceName: workspace()
      ? workspaceName(workspace()!.project, workspace()!.workspace.path)
      : undefined,
    navigate: (href: string) => navigate(href),
  });
  provideCommands({ commands, context: commandContext });
  const extensionActions = (): Command[] =>
    commands()
      .filter((c) => !c.when || c.when(commandContext()))
      .map((c) => ({
        id: c.id,
        label: c.title,
        hint: c.hint?.(commandContext()),
        words: c.words,
        icon: c.icon,
        keys: c.keys,
        group: 'Actions',
        run: () => void runCommand(c.id),
      }));
  const placeLists = useSlots('palette.search', (slot) => slot.use());
  const places = (): Command[] =>
    placeLists()
      .flatMap((list) => list())
      .map((p) => ({ ...p, run: () => navigate(p.href) }));

  const sessionId = () => {
    const [, kind, id] = location.pathname.split('/');
    return kind === 's' && id ? decodeURIComponent(id) : undefined;
  };

  const whereOf = (s: SessionSummary) => {
    const project = projects().find((p) => p.id === s.projectId);
    if (!project) return undefined;
    if (project.id === CHATS_ID || !s.cwd) return project.name;
    return workspaceName(project, s.cwd);
  };

  const sessionItem = (s: SessionSummary, group?: string): Command => ({
    id: `s:${s.id}`,
    label: s.title || 'Untitled',
    hint: [whereOf(s), s.archivedAt && 'archived'].filter(Boolean).join(' · '),
    icon: () => <StatusDot status={s.archivedAt ? 'idle' : s.status} />,
    meta: age(s.updatedAt),
    group,
    run: () => navigate(paths.s(s.id)()),
  });

  const startIn = (target: Target) => {
    setCurrentTarget(target);
    closeDrawer();
    navigate(paths());
    focusComposer();
  };

  // Where a new session would start: this page's workspace, else the last one picked.
  const newSessionHere = () => {
    const w = workspace();
    if (w) startIn({ projectId: w.project.id, cwd: w.workspace.path });
    else {
      closeDrawer();
      navigate(paths());
      focusComposer();
    }
  };

  // Waiting first, then unread answers, then failures; newest first in each.
  // The open one is skipped, so pressing again moves on.
  const needsYou = () =>
    sessions()
      .filter((s) => !s.archivedAt && NEEDS_YOU.includes(s.status))
      .sort(
        (a, b) =>
          NEEDS_YOU.indexOf(a.status) - NEEDS_YOU.indexOf(b.status) ||
          b.updatedAt - a.updatedAt,
      );

  const nextNeedsYou = () => {
    const next = needsYou().find((s) => s.id !== sessionId());
    if (!next) return toast('Nothing needs you');
    closeDrawer();
    navigate(paths.s(next.id)());
  };

  const targetsPage = (): Page => ({
    title: 'New session',
    placeholder: 'Where should it start?',
    items: () =>
      projects().flatMap((p): Command[] =>
        p.id === CHATS_ID
          ? [
              {
                id: `t:${p.id}`,
                label: 'New chat',
                hint: 'no project',
                icon: SessionIcon,
                run: () =>
                  startIn({ projectId: p.id, cwd: p.path, worktree: true }),
              },
            ]
          : [
              ...p.workspaces.map((w) => ({
                id: `t:${p.id}:${w.path}`,
                label: workspaceName(p, w.path),
                hint: w.branch ?? undefined,
                icon: FolderIcon,
                run: () => startIn({ projectId: p.id, cwd: w.path }),
              })),
              ...(p.git
                ? [
                    {
                      id: `t:${p.id}:new`,
                      label: `${p.name} / New worktree`,
                      words: 'branch',
                      icon: BranchIcon,
                      run: () =>
                        startIn({
                          projectId: p.id,
                          cwd: p.path,
                          worktree: true,
                        }),
                    },
                  ]
                : []),
            ],
      ),
  });

  const workspaceItems = (): Command[] =>
    projects()
      .filter((p) => p.id !== CHATS_ID)
      .flatMap((p) =>
        p.workspaces.map((w) => ({
          id: `w:${p.id}:${w.path}`,
          label: workspaceName(p, w.path),
          hint: w.branch ?? undefined,
          words: 'project',
          icon: w.main ? FolderIcon : BranchIcon,
          group: 'Projects',
          run: () => navigate(workspaceHref({ projectId: p.id, cwd: w.path })),
        })),
      );

  const projectsPage = (): Page => ({
    title: 'Go to project',
    placeholder: 'Search projects and worktrees…',
    items: () => workspaceItems().map((c) => ({ ...c, group: undefined })),
  });

  const themePage = (): Page => ({
    title: 'Theme',
    placeholder: 'Pick a theme…',
    items: () =>
      (['system', 'light', 'dark'] as Theme[]).map((t) => ({
        id: `theme:${t}`,
        label: t[0]!.toUpperCase() + t.slice(1),
        icon: theme() === t ? CheckIcon : undefined,
        run: () => setTheme(t),
      })),
  });

  const renamePage = (s: SessionSummary): Page => ({
    title: 'Rename',
    placeholder: s.title || 'New title…',
    raw: true,
    items: (q) =>
      q.trim()
        ? [
            {
              id: 'rename',
              label: `Rename to “${q.trim()}”`,
              icon: PencilIcon,
              run: () => void renameSession(s.id, q.trim()),
            },
          ]
        : [],
  });

  const shortcutsPage = (): Page => ({
    title: 'Keyboard shortcuts',
    placeholder: 'Search shortcuts…',
    items: () => [
      {
        id: 'k:palette',
        label: 'Open the command palette',
        icon: SearchIcon,
        keys: { code: 'KeyK', mod: true },
      },
      ...actions()
        .filter((c) => c.keys)
        .map((c) => ({ ...c, group: undefined })),
    ],
  });

  // The open session's own actions, as in its sidebar menu.
  const sessionActions = (): Command[] => {
    const s = sessions().find((s) => s.id === sessionId());
    if (!s) return [];
    const group = 'This session';
    const running = s.status === 'running' || s.status === 'retrying';
    return [
      ...(running
        ? [
            {
              id: 'c:stop',
              label: 'Stop',
              icon: StopIcon,
              group,
              run: () => void stopSession(s.id),
            },
          ]
        : []),
      {
        id: 'c:rename',
        label: 'Rename',
        words: 'title',
        icon: PencilIcon,
        group,
        page: () => renamePage(s),
      },
      {
        id: 'c:fork',
        label: 'Fork',
        words: 'copy branch duplicate',
        icon: ForkIcon,
        group,
        run: () => void forkSession(s.id).then((id) => navigate(paths.s(id)())),
      },
      ...(s.status === 'idle' && !s.archivedAt
        ? [
            {
              id: 'c:unread',
              label: 'Mark as unread',
              icon: UnreadIcon,
              group,
              run: () => {
                navigate(paths());
                void markSeen(s.id, false);
              },
            },
          ]
        : []),
      ...(s.archivedAt
        ? [
            {
              id: 'c:unarchive',
              label: 'Unarchive',
              icon: RestoreIcon,
              group,
              run: () => void archiveSession(s.id, false),
            },
          ]
        : running
          ? []
          : [
              {
                id: 'c:archive',
                label: 'Archive',
                words: 'hide done close',
                icon: ArchiveIcon,
                group,
                run: () =>
                  void archiveWithChildren(s, sessions(), () =>
                    navigate(paths()),
                  ),
              },
            ]),
    ];
  };

  const actions = (): Command[] => {
    const group = 'Actions';
    const w = workspace();
    const here = w
      ? workspaceName(w.project, w.workspace.path)
      : (projects().find((p) => p.id === currentTarget()?.projectId)?.name ??
        undefined);
    return [
      {
        id: 'a:new-here',
        label: 'New session',
        hint: here,
        words: 'chat start create',
        icon: PlusIcon,
        keys: { code: 'KeyO', mod: true, shift: true },
        group,
        run: newSessionHere,
      },
      {
        id: 'a:new',
        label: 'New session in…',
        words: 'chat start create worktree',
        icon: SessionIcon,
        group,
        page: targetsPage,
      },
      {
        id: 'a:hub',
        label: 'Hub',
        words: 'orchestrator coordinator home inbox',
        icon: HubIcon,
        group,
        run: () => navigate(paths.hub()),
      },
      {
        id: 'a:next',
        label: 'Next session that needs you',
        words: 'unread waiting inbox jump answer',
        icon: ArrowDownIcon,
        keys: { code: 'ArrowDown', alt: true, shift: true },
        group,
        run: nextNeedsYou,
      },
      ...extensionActions(),
      {
        id: 'a:projects',
        label: 'Go to project…',
        words: 'open workspace worktree branch',
        icon: FolderIcon,
        group,
        page: projectsPage,
      },
      {
        id: 'a:add-project',
        label: 'Add project',
        words: 'folder repo',
        icon: FolderIcon,
        group,
        run: openProjectPicker,
      },
      {
        id: 'a:sidebar',
        label: 'Show or hide sessions',
        words: 'sidebar toggle panel',
        icon: SidebarIcon,
        keys: { code: 'KeyB', mod: true },
        group,
        run: toggleSidebar,
      },
      {
        id: 'a:inspector',
        label: 'Show or hide files and changes',
        words: 'inspector git diff toggle panel',
        icon: InspectorIcon,
        keys: { code: 'KeyB', mod: true, alt: true },
        group,
        run: toggleInspector,
      },
      {
        id: 'a:theme',
        label: 'Theme…',
        words: 'dark light appearance',
        icon: ThemeIcon,
        group,
        page: themePage,
      },
      {
        id: 'a:settings',
        label: 'Settings',
        words: 'preferences models providers',
        icon: SettingsIcon,
        group,
        run: () => navigate(paths.settings()),
      },
      {
        id: 'a:shortcuts',
        label: 'Keyboard shortcuts',
        words: 'keys help',
        icon: KeyboardIcon,
        keys: { code: 'Slash', mod: true },
        group,
        page: shortcutsPage,
      },
    ];
  };

  const root: Page = {
    placeholder: 'Search sessions, projects, and actions…',
    items: (q) => {
      const open = sessions().filter((s) => s.id !== sessionId());
      if (q)
        return [
          // Live sessions before archived ones, newest first in each.
          ...[...open]
            .sort(
              (a, b) =>
                Number(!!a.archivedAt) - Number(!!b.archivedAt) ||
                b.updatedAt - a.updatedAt,
            )
            .map((s) => sessionItem(s)),
          ...workspaceItems(),
          ...places(),
          ...sessionActions(),
          ...actions(),
        ];
      const waiting = needsYou().filter((s) => s.id !== sessionId());
      const recent = open
        .filter((s) => !s.archivedAt && !NEEDS_YOU.includes(s.status))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5);
      return [
        ...waiting.slice(0, 9).map((s) => sessionItem(s, 'Needs you')),
        ...recent.map((s) => sessionItem(s, 'Recent')),
        ...sessionActions(),
        ...actions(),
      ];
    },
  };

  const page = () => stack().at(-1) ?? root;

  const results = createMemo(
    () => {
      const p = page();
      const items = p.items(query());
      const q = query().trim().toLowerCase();
      if (!q || p.raw) return items;
      const words = q.split(/\s+/);
      // Typing flattens the groups: the best match goes first, whatever it is.
      return items
        .map((c) => ({ c, score: rank(c, words) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => ({ ...r.c, group: undefined }));
    },
    // A server memo runs in the context it was created in, outside the Loading
    // boundary, so it has to be a client source to fall back instead of throwing.
    { name: 'paletteResults', lazy: true, ssrSource: 'client' },
  );

  const choose = (c: Command | undefined) => {
    if (!c) return;
    if (c.page) {
      setStack((s) => [...s, c.page!()]);
      setQuery('');
      setActive(0);
      if (input) input.value = '';
      return;
    }
    if (!c.run) return;
    closePalette();
    c.run();
  };

  const back = () => {
    setStack((s) => s.slice(0, -1));
    setQuery('');
    setActive(0);
    if (input) input.value = '';
  };

  createEffect(
    () => active(),
    (i) => {
      document
        .getElementById(`palette-${i}`)
        ?.scrollIntoView({ block: 'nearest' });
    },
  );

  onSettled(() => {
    // Capture: runs before the composer or a terminal handles the key.
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (matches(e, { code: 'KeyK', mod: true })) {
        e.preventDefault();
        e.stopPropagation();
        if (dialog?.open) closePalette();
        else openPalette();
        return;
      }
      if (matches(e, { code: 'Slash', mod: true })) {
        e.preventDefault();
        e.stopPropagation();
        openPalette();
        setStack([shortcutsPage()]);
        return;
      }
      const c = actions().find((c) => c.keys && matches(e, c.keys) && c.run);
      if (!c) return;
      e.preventDefault();
      e.stopPropagation();
      if (dialog?.open) closePalette();
      c.run!();
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  });

  // The list can shrink under the highlight, so it stops at the last row.
  const selected = () => Math.min(active(), results().length - 1);

  const step = (d: number) => {
    const n = results().length;
    if (n) setActive((selected() + d + n) % n);
  };

  const onInputKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      choose(results()[selected()]);
    } else if (e.key === 'Backspace' && !input?.value && stack().length) {
      e.preventDefault();
      back();
    }
  };

  return (
    <dialog
      ref={(el) => (dialog = el)}
      class={[
        'm-auto mt-[12dvh] flex max-h-[min(34rem,76dvh)] w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-card border border-line bg-panel text-fg shadow-sheet backdrop:bg-black/40 not-open:hidden',
        // Phone: the whole screen, so the list gets all the room the keyboard leaves.
        'max-md:m-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:pt-[env(safe-area-inset-top)]',
      ]}
      aria-label="Command palette"
      onClick={(e) => e.target === e.currentTarget && closePalette()}
      onCancel={(e) => {
        // Esc steps back out of a second page before it closes.
        if (!stack().length) return;
        e.preventDefault();
        back();
      }}
    >
      <Loading fallback={<div class="h-12" />}>
        <div class="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-2 pl-3.5 touch:h-14">
          <span class="text-muted">
            <SearchIcon />
          </span>
          <Show when={page().title}>
            <button
              class="shrink-0 rounded-sm bg-surface px-1.5 text-meta text-muted transition-colors hover:text-fg"
              title="Back"
              onClick={() => {
                back();
                input?.focus();
              }}
            >
              {page().title}
            </button>
          </Show>
          <input
            ref={(el) => (input = el)}
            class="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted touch:text-read"
            placeholder={page().placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={
              results().length ? `palette-${selected()}` : undefined
            }
            autocomplete="off"
            spellcheck="false"
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
          />
          <Button size="sm" class="md:hidden" onClick={closePalette}>
            Cancel
          </Button>
        </div>
        <ul
          id="palette-list"
          role="listbox"
          aria-label={page().title ?? 'Commands'}
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
        >
          <For
            each={results()}
            keyed={(c) => c.id}
            fallback={
              <li class="px-2 py-3 text-muted">
                {page().raw ? page().placeholder : 'No matches'}
              </li>
            }
          >
            {(c, i) => (
              <>
                <Show
                  when={
                    c().group &&
                    (i() === 0 || results()[i() - 1]?.group !== c().group)
                  }
                >
                  <li
                    role="presentation"
                    class="px-2 pt-2 pb-1 text-meta text-muted"
                  >
                    {c().group}
                  </li>
                </Show>
                <li
                  id={`palette-${i()}`}
                  role="option"
                  aria-selected={String(i() === selected()) as 'true' | 'false'}
                  class="flex h-8 items-center gap-2.5 rounded-md px-2 aria-selected:bg-active touch:h-11"
                  onPointerMove={() => setActive(i())}
                  onClick={() => choose(c())}
                >
                  <span class="grid w-4 shrink-0 place-items-center text-muted">
                    <Show when={c().icon}>
                      {(icon) => <Dynamic component={icon()} />}
                    </Show>
                  </span>
                  <span class="flex min-w-0 flex-1 items-baseline gap-2">
                    <span class="truncate" dir="auto">
                      {c().label}
                    </span>
                    <Show when={c().hint}>
                      <span class="min-w-0 flex-1 truncate text-meta text-muted">
                        {c().hint}
                      </span>
                    </Show>
                  </span>
                  <Show
                    when={c().keys}
                    fallback={
                      <Show
                        when={c().page}
                        fallback={
                          <Show when={c().meta}>
                            <span class="shrink-0 text-meta text-muted tabular-nums">
                              {c().meta}
                            </span>
                          </Show>
                        }
                      >
                        <span class="text-muted">
                          <ChevronIcon />
                        </span>
                      </Show>
                    }
                  >
                    {(keys) => (
                      <kbd class="shrink-0 font-ui text-meta tracking-wider text-muted">
                        {keyLabel(keys())}
                      </kbd>
                    )}
                  </Show>
                </li>
              </>
            )}
          </For>
        </ul>
      </Loading>
    </dialog>
  );
}
