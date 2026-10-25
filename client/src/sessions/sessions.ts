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

export function useSessions() {
  return useTopic('sessions', () => ({}));
}

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
export function useConversation(id: () => string) {
  return useTopicWhenReady('conversation', () => ({ id: id() }));
}

export function startSession(
  projectId: string,
  cwd: string,
  prompt: string,
  images: PromptImage[],
  choice?: ModelChoice,
  worktree?: boolean,
  agent?: AgentId,
  tonight?: boolean,
) {
  return request('session.create', {
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
}

/** A session held for tonight: save its prompt, run it now, or cancel. */
export function tonightAction(
  id: string,
  action: 'save' | 'run' | 'cancel',
  prompt?: string,
) {
  return request('session.tonight', { id, action, prompt });
}

export function archiveSession(id: string, archived = true) {
  return request('session.archive', { id, archived });
}

export function markSeen(id: string, seen = true) {
  return request('session.seen', { id, seen });
}

export function renameSession(id: string, title: string) {
  return request('session.rename', { id, title });
}

// keep: in a session its parent drives, leave it with the parent.
export function sendPrompt(
  id: string,
  prompt: string,
  images: PromptImage[],
  opts: { steer?: boolean; keep?: boolean } = {},
) {
  return request('session.submit', {
    id,
    prompt,
    images,
    requestId: requestId(),
    whenBusy: opts.steer ? 'steer' : undefined,
    keep: opts.keep || undefined,
  });
}

export function handBack(id: string) {
  return request('session.handBack', { id });
}

export function withdrawQueued(id: string, submission: number) {
  return request('session.withdraw', { id, submission });
}

export function pushQueued(id: string, submission: number) {
  return request('session.push', { id, submission });
}

export function stopSession(id: string) {
  return request('session.stop', { id });
}

export function retrySession(id: string) {
  return request('session.retry', { id });
}

export function compactSession(id: string, instructions?: string) {
  return request('session.compact', { id, instructions });
}

const [pruning, setPruning] = createSignal<ReadonlySet<string>>(new Set(), {
  name: 'pruning',
});

/** Pruning asked for here that hasn't landed yet. */
export function isPruning(id: string) {
  return pruning().has(id);
}

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

export function setAgent(id: string, agent: AgentId) {
  return request('session.agent', { id, agent });
}

export function setVoiceSettings(id: string, voice: VoiceSettings) {
  return request('session.voice', { id, voice });
}

export function configureSession(id: string, choice: ModelChoice) {
  return request('session.configure', { id, ...choice });
}

/** A new session with the history up to entry `at` (absent: all); its id. */
export function forkSession(id: string, at?: number) {
  return request('session.fork', { id, at });
}
