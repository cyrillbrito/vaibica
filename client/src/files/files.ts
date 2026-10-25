import { createSignal } from 'solid-js';

import { toast } from '../ui/Toast';
import { paths } from '../router';
import { fixtureKept, testing } from '../fixtures';
import type { WorkspaceRef } from '@bica/shared/protocol';
import { request, useTopic } from '../socket/socket';

/** What the main area shows: a file, or one side of a git change. */
export type View = 'file' | 'staged' | 'changes';

export const useFiles = (ref: () => WorkspaceRef) => useTopic('files', ref);

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
  JSON.parse(localStorage.getItem(KEPT_KEY) ?? '[]'),
  { name: 'keptFiles' },
);
/** Reactive: files kept open on this device (test data stands in, see fixtures/). */
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
