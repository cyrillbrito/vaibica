import type { GitStatus, WorkspaceRef } from '@bica/shared/protocol';
import { request, useTopic } from '../socket/socket';

export const useGitStatus = (ref: () => WorkspaceRef) =>
  useTopic('git.status', ref);

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
