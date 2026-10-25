import type { GitStatus, WorkspaceRef } from '@bica/shared/protocol';
import { request, useTopic } from '../socket/socket';

export function useGitStatus(ref: () => WorkspaceRef) {
  return useTopic('git.status', ref);
}

/** The workspace's own repo first, then each submodule worth showing. */
export function repos(status: GitStatus) {
  return [{ ...status, path: '' }, ...status.submodules];
}

// repo: a submodule's path; '' or absent, the workspace's own repo.
export function stage(ref: WorkspaceRef, paths?: string[], repo?: string) {
  return request('git.stage', { ...ref, paths, repo: repo || undefined });
}

export function unstage(ref: WorkspaceRef, paths?: string[], repo?: string) {
  return request('git.unstage', { ...ref, paths, repo: repo || undefined });
}

export function commit(
  ref: WorkspaceRef,
  message: string,
  options: { all?: boolean; amend?: boolean; repo?: string } = {},
) {
  return request('git.commit', {
    ...ref,
    message,
    ...options,
    repo: options.repo || undefined,
  });
}

export function discard(ref: WorkspaceRef, paths: string[], repo?: string) {
  return request('git.discard', { ...ref, paths, repo: repo || undefined });
}

export function push(ref: WorkspaceRef, repo?: string) {
  return request('git.push', { ...ref, repo: repo || undefined });
}

export function pull(ref: WorkspaceRef, repo?: string) {
  return request('git.pull', { ...ref, repo: repo || undefined });
}

export function suggestMessage(
  ref: WorkspaceRef,
  options: { all?: boolean; fresh?: boolean; repo?: string } = {},
) {
  return request('git.suggest', {
    ...ref,
    ...options,
    repo: options.repo || undefined,
  });
}

export function readDiff(
  ref: WorkspaceRef,
  path: string,
  staged: boolean,
  oldPath?: string,
  repo?: string,
) {
  return request('git.diff', {
    ...ref,
    path,
    staged,
    oldPath,
    repo: repo || undefined,
  });
}
