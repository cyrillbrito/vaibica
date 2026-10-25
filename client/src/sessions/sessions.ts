import { createMemo, createSignal } from 'solid-js';
import type { AgentId } from '@bica/shared/agents';
import type {
  ModelChoice,
  PromptImage,
  VoiceSettings,
} from '@bica/shared/protocol';
import {
  request,
  requestId,
  useTopic,
  useTopicWhenReady,
} from '../socket/socket';

export const useSessions = () => useTopic('sessions', () => ({}));

/** The hub (docs/hub.md): the newest open hub session outside any project. */
export function useHub() {
  const sessions = useSessions();
  return createMemo(
    () =>
      sessions().find(
        (s) => s.agent === 'hub' && !s.archivedAt && !s.projectId,
      ),
    { name: 'hub' },
  );
}

// Undefined while it loads: the session page shows its frame from the list.
export const useConversation = (id: () => string) =>
  useTopicWhenReady('conversation', () => ({ id: id() }));

export const startSession = (
  projectId: string,
  cwd: string,
  prompt: string,
  images: PromptImage[],
  choice?: ModelChoice,
  worktree?: boolean,
  agent?: AgentId,
  tonight?: boolean,
) =>
  request('session.create', {
    projectId,
    cwd,
    prompt,
    images,
    requestId: requestId(),
    choice,
    worktree,
    agent,
    tonight,
  });

/** A session held for tonight: save its prompt, run it now, or cancel. */
export const tonightAction = (
  id: string,
  action: 'save' | 'run' | 'cancel',
  prompt?: string,
) => request('session.tonight', { id, action, prompt });

export const archiveSession = (id: string, archived = true) =>
  request('session.archive', { id, archived });

export const markSeen = (id: string, seen = true) =>
  request('session.seen', { id, seen });

export const renameSession = (id: string, title: string) =>
  request('session.rename', { id, title });

// keep: in a session its parent drives, leave it with the parent.
export const sendPrompt = (
  id: string,
  prompt: string,
  images: PromptImage[],
  opts: { steer?: boolean; keep?: boolean } = {},
) =>
  request('session.submit', {
    id,
    prompt,
    images,
    requestId: requestId(),
    whenBusy: opts.steer ? 'steer' : undefined,
    keep: opts.keep || undefined,
  });

export const handBack = (id: string) => request('session.handBack', { id });

export const withdrawQueued = (id: string, submission: number) =>
  request('session.withdraw', { id, submission });

export const pushQueued = (id: string, submission: number) =>
  request('session.push', { id, submission });

export const stopSession = (id: string) => request('session.stop', { id });

export const retrySession = (id: string) => request('session.retry', { id });

export const compactSession = (id: string, instructions?: string) =>
  request('session.compact', { id, instructions });

const [pruning, setPruning] = createSignal<ReadonlySet<string>>(new Set(), {
  name: 'pruning',
});

/** Pruning asked for here that hasn't landed yet. */
export const isPruning = (id: string) => pruning().has(id);

export async function pruneSession(id: string) {
  if (isPruning(id)) return;
  setPruning((s) => new Set(s).add(id));
  try {
    await request('session.cleanup', { id });
  } finally {
    setPruning((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }
}

export const setAgent = (id: string, agent: AgentId) =>
  request('session.agent', { id, agent });

export const setVoiceSettings = (id: string, voice: VoiceSettings) =>
  request('session.voice', { id, voice });

export const configureSession = (id: string, choice: ModelChoice) =>
  request('session.configure', { id, ...choice });

/** A new session with the history up to entry `at` (absent: all); its id. */
export const forkSession = (id: string, at?: number) =>
  request('session.fork', { id, at });
