import { useLocation } from '@solidjs/router';
import { isServer } from '@solidjs/web';
import { createMemo, createSignal } from 'solid-js';

import { toast } from '../components/ui/Toast';
import { paths } from '../router';
import { fixtureKept, testing } from './fixtures';
import { useProjects } from './projects';
import type { GitStatus, WorkspaceRef } from './protocol';
import { useSessions } from './sessions';
import { request, useTopic } from './socket';
import { useTerminals } from './terminals';

/** What the main area shows: a file, or one side of a git change. */
export type View = 'file' | 'staged' | 'changes';

export const useGitStatus = (ref: () => WorkspaceRef) =>
  useTopic('git.status', ref);

export const useFiles = (ref: () => WorkspaceRef) => useTopic('files', ref);

/** The workspace's own repo first, then each submodule worth showing. */
export const repos = (status: GitStatus) => [
  { ...status, path: '' },
  ...status.submodules,
];

// repo: a submodule's path; '' or absent, the workspace's own repo.
export const stage = (ref: WorkspaceRef, paths?: string[], repo?: string) =>
  request('git.stage', { ...ref, paths, repo: repo || undefined });

export const unstage = (ref: WorkspaceRef, paths?: string[], repo?: string) =>
  request('git.unstage', { ...ref, paths, repo: repo || undefined });

export const commit = (
  ref: WorkspaceRef,
  message: string,
  options: { all?: boolean; amend?: boolean; repo?: string } = {},
) =>
  request('git.commit', {
    ...ref,
    message,
    ...options,
    repo: options.repo || undefined,
  });

export const discard = (ref: WorkspaceRef, paths: string[], repo?: string) =>
  request('git.discard', { ...ref, paths, repo: repo || undefined });

export const push = (ref: WorkspaceRef, repo?: string) =>
  request('git.push', { ...ref, repo: repo || undefined });

export const pull = (ref: WorkspaceRef, repo?: string) =>
  request('git.pull', { ...ref, repo: repo || undefined });

export const suggestMessage = (
  ref: WorkspaceRef,
  options: { all?: boolean; fresh?: boolean; repo?: string } = {},
) =>
  request('git.suggest', {
    ...ref,
    ...options,
    repo: options.repo || undefined,
  });

export const readDiff = (
  ref: WorkspaceRef,
  path: string,
  staged: boolean,
  oldPath?: string,
  repo?: string,
) =>
  request('git.diff', {
    ...ref,
    path,
    staged,
    oldPath,
    repo: repo || undefined,
  });

/** On the dev machine, so it only helps when you sit at it. */
export const openInEditor = (ref: WorkspaceRef, path?: string) =>
  request('editor.open', { ...ref, path }).catch((e: unknown) =>
    toast(e instanceof Error ? e.message : String(e)),
  );

export const openPath = (path: string, cwd?: string, reveal?: boolean) =>
  request('path.open', { path, cwd, reveal }).catch((e: unknown) =>
    toast(e instanceof Error ? e.message : String(e)),
  );

export const readFile = (ref: WorkspaceRef, path: string) =>
  request('file.read', { ...ref, path });

export function workspaceHref(ref: WorkspaceRef, open?: Open) {
  const q = new URLSearchParams({ w: ref.cwd });
  if (open) setOpen(q, open);
  return `${String(paths.p(ref.projectId))}?${q}`;
}

export type Open = { path: string; view: View };

export const sameOpen = (a?: Open, b?: Open) =>
  a?.path === b?.path && a?.view === b?.view;

function setOpen(q: URLSearchParams, open: Open) {
  q.set(open.view === 'file' ? 'f' : 'd', open.path);
  if (open.view !== 'file') q.set('s', open.view);
}

/** A session page with a file open over its chat. */
export function sessionFileHref(id: string, open: Open) {
  const q = new URLSearchParams();
  setOpen(q, open);
  return `${String(paths.s(id))}?${q}`;
}

/**
 * Where opening a file from the side panel goes: over the chat when a
 * session is open, so closing it lands back in the session; the workspace page
 * otherwise. Read at click time, so the plain location is enough.
 */
export function openHref(ref: WorkspaceRef, open: Open) {
  const [, kind, id] = location.pathname.split('/');
  return kind === 's' && id
    ? sessionFileHref(decodeURIComponent(id), open)
    : workspaceHref(ref, open);
}

export type Kept = WorkspaceRef & Open;

// ponytail: per device in localStorage; move to the server if laptop and
// phone should share them.
const KEPT_KEY = 'bica.kept';
const [keptHere, setKept] = createSignal<Kept[]>(
  isServer ? [] : JSON.parse(localStorage.getItem(KEPT_KEY) ?? '[]'),
  { name: 'keptFiles' },
);
/** Reactive: files kept open on this device (test data stands in, see lib/fixtures). */
export const kept = () => fixtureKept() ?? keptHere();

const samePlace = (a: Kept, ref: WorkspaceRef, path: string) =>
  a.projectId === ref.projectId && a.cwd === ref.cwd && a.path === path;

export const isKept = (ref: WorkspaceRef, path: string) =>
  kept().some((k) => samePlace(k, ref, path));

function saveKept(list: Kept[]) {
  // Test data must never land in this device's real list.
  if (testing()) return;
  setKept(list);
  localStorage.setItem(KEPT_KEY, JSON.stringify(list));
}

export const keepOpen = (ref: WorkspaceRef, open: Open) =>
  saveKept([
    ...kept().filter((k) => !samePlace(k, ref, open.path)),
    { projectId: ref.projectId, cwd: ref.cwd, ...open },
  ]);

export const closeKept = (ref: WorkspaceRef, path: string) =>
  saveKept(kept().filter((k) => !samePlace(k, ref, path)));

/**
 * The file open on a workspace page: ?f=path, or ?d=path&s=staged|changes.
 */
export function openFromSearch(search: string) {
  const q = new URLSearchParams(search);
  const file = q.get('f');
  if (file) return { path: file, view: 'file' as View };
  const path = q.get('d');
  if (!path) return undefined;
  const s = q.get('s');
  const view: View = s === 'staged' ? s : 'changes';
  return { path, view };
}

/**
 * The workspace the current page is about: the workspace page's, or the
 * workspace the open session or terminal runs in.
 */
export function useCurrentWorkspace() {
  const location = useLocation();
  const projects = useProjects();
  const sessions = useSessions();
  const terminals = useTerminals();
  return createMemo(
    () => {
      const [, kind, id] = location.pathname.split('/');
      let projectId: string | null | undefined;
      let cwd: string | null | undefined;
      if (kind === 'p' && id) {
        projectId = decodeURIComponent(id);
        cwd = new URLSearchParams(location.search).get('w');
      } else if (kind === 's' && id) {
        const s = sessions().find((s) => s.id === decodeURIComponent(id));
        projectId = s?.projectId;
        cwd = s?.cwd;
      } else if (kind === 't' && id) {
        const t = terminals().find((t) => t.id === decodeURIComponent(id));
        projectId = t?.projectId;
        cwd = t?.cwd;
      }
      const project = projects().find((p) => p.id === projectId);
      if (!project) return undefined;
      const workspace =
        project.workspaces.find((w) => w.path === (cwd ?? project.path)) ??
        undefined;
      if (!workspace) return undefined;
      return {
        project,
        workspace,
        ref: { projectId: project.id, cwd: workspace.path },
      };
    },
    {
      name: 'currentWorkspace',
      // Built from socket topics, which only exist in the browser.
      ssrSource: 'client',
      // Keep the panel mounted while the same workspace stays open.
      equals: (a, b) =>
        a?.ref.projectId === b?.ref.projectId &&
        a?.ref.cwd === b?.ref.cwd &&
        a?.project === b?.project,
    },
  );
}
