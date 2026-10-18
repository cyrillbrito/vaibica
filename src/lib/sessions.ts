import { createMemo, createSignal } from 'solid-js';
import type { ProfileId } from './profiles';
import type { ModelChoice, PromptImage, VoiceSettings } from './protocol';
import { request, requestId, useTopic, useTopicWhenReady } from './socket';

export const useSessions = () => useTopic('sessions', () => ({}));

/** The hub (docs/hub.md): the newest open hub session outside any project. */
export function useHub() {
  const sessions = useSessions();
  return createMemo(
    () =>
      sessions().find(
        (s) => s.profile === 'hub' && !s.archivedAt && !s.projectId,
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
  profile?: ProfileId,
) =>
  request('session.create', {
    projectId,
    cwd,
    prompt,
    images,
    requestId: requestId(),
    choice,
    worktree,
    profile,
  });

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

export const compactSession = (id: string, instructions?: string) =>
  request('session.compact', { id, instructions });

const [cleaning, setCleaning] = createSignal<ReadonlySet<string>>(new Set(), {
  name: 'cleaning',
});

/** A clean up asked for here that hasn't landed yet. */
export const isCleaning = (id: string) => cleaning().has(id);

export async function cleanupSession(id: string) {
  if (isCleaning(id)) return;
  setCleaning((s) => new Set(s).add(id));
  try {
    await request('session.cleanup', { id });
  } finally {
    setCleaning((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }
}

export const setProfile = (id: string, profile: ProfileId) =>
  request('session.profile', { id, profile });

export const setVoiceSettings = (id: string, voice: VoiceSettings) =>
  request('session.voice', { id, voice });

export const configureSession = (id: string, choice: ModelChoice) =>
  request('session.configure', { id, ...choice });

/** A new session with the history up to entry `at` (absent: all); its id. */
export const forkSession = (id: string, at?: number) =>
  request('session.fork', { id, at });
