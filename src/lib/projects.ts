import { isServer } from '@solidjs/web';
import { createSignal } from 'solid-js';

import type { Project, Workspace } from './protocol';
import { request, useTopic } from './socket';

export const useProjects = () => useTopic('projects', () => ({}));

export const addProject = (path: string) => request('project.add', { path });

export const reorderProjects = (ids: string[]) =>
  request('project.reorder', { ids });

export const listDirs = (path?: string) => request('fs.dirs', { path });

export const cleanUpWorktree = (
  projectId: string,
  cwd: string,
  force = false,
) => request('worktree.cleanUp', { projectId, cwd, force });

const baseName = (path: string) =>
  path.split('/').filter(Boolean).pop() ?? path;

export const folderName = baseName;

/** The built-in project for chats: each starts in a new empty folder. */
export const CHATS_ID = 'chats';

// The main folder is just "project": a label like "main" reads as the branch
// and clashes with the branch line below it.
/** "project" for the main folder, "project / folder" for a worktree. */
export function workspaceName(project: Project, path: string) {
  const workspace = project.workspaces.find((w) => w.path === path);
  if (workspace?.main || path === project.path) return project.name;
  return `${project.name} / ${folderName(path)}`;
}

export interface Target {
  projectId: string;
  cwd?: string;
  // Start in a new worktree of the project instead.
  worktree?: boolean;
}

const KEY = 'bica.project';
const CWD_KEY = 'bica.cwd';
const WORKTREE_KEY = 'bica.worktree';

// Where new sessions start; remembered across visits.
const [currentTarget, setTarget] = createSignal<Target | undefined>(
  isServer || !localStorage.getItem(KEY)
    ? undefined
    : {
        projectId: localStorage.getItem(KEY)!,
        cwd: localStorage.getItem(CWD_KEY) ?? undefined,
        worktree: !!localStorage.getItem(WORKTREE_KEY),
      },
  { name: 'currentTarget' },
);

export { currentTarget };

export function setCurrentTarget(target: Target) {
  localStorage.setItem(KEY, target.projectId);
  if (target.cwd) localStorage.setItem(CWD_KEY, target.cwd);
  else localStorage.removeItem(CWD_KEY);
  if (target.worktree) localStorage.setItem(WORKTREE_KEY, '1');
  else localStorage.removeItem(WORKTREE_KEY);
  setTarget(target);
}

/** The remembered target if it still exists, else the first project's folder. */
export function resolveTarget(projects: Project[], target?: Target) {
  const project =
    projects.find((p) => p.id === target?.projectId) ?? projects[0];
  if (!project) return undefined;
  const workspace: Workspace =
    (project.id === target?.projectId &&
      project.workspaces.find((w) => w.path === target.cwd)) ||
    project.workspaces.find((w) => w.path === project.path) ||
    project.workspaces[0]!;
  // A chat always gets a new folder.
  const worktree =
    project.id === CHATS_ID ||
    (project.id === target?.projectId && !!target.worktree);
  return { project, workspace, worktree };
}
