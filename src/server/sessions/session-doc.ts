import 'server-only';
import { defineDoc } from '@earendil-works/pi-durable';

import type { ProfileId } from '#lib/profiles';
import type { Handoff, PullRequest, VoiceSettings } from '#lib/protocol';

// App metadata stored next to each conversation; Pi Durable has no titles.
export const SessionDoc = defineDoc<{
  title: string;
  createdAt: number;
  projectId?: string;
  // When it was archived; 0 or unset: shown in the list.
  archivedAt?: number;
  // Newest entry opened in the browser; later ones are unread. Unset: treated
  // as read, so sessions that predate the field don't all light up.
  seenEntry?: number;
  // The session this one was forked from.
  forkedFrom?: string;
  // Its last entry from that session.
  forkedAt?: number;
  // The session whose agent started this one (session_start).
  startedBy?: string;
  // Its worktree was cleaned up: the branch and PR it had then.
  cleanedUp?: { branch: string | null; pr: PullRequest | null };
  // Its profile (src/lib/profiles.ts). Unset: from before profiles, coding.
  profile?: ProfileId;
  // Started with session_start's `notify: false`: its starter hears nothing.
  quiet?: boolean;
  // Who sent the newest prompt: "user", "bica" for a note, or a session id.
  lastFrom?: string;
  // The user drives it: he started it, or took it over from the session that
  // did, until he hands it back (docs/sessions.md). Unset: from before the
  // field, so a session the user started counts as his.
  userPrompted?: boolean;
  // Each time the user took it over or handed it back.
  handoffs?: Handoff[];
  voice?: VoiceSettings;
  // Sessions that asked to hear when its current or next run ends
  // (session_send's `notify`). Stored, so a restart doesn't lose them.
  watchers?: string[];
  // Sessions it messaged during its current run: they need no note that
  // repeats what it told them.
  messaged?: string[];
  // The memory index as the agent sees it (loadMemory), '' for none. Unset:
  // taken again on the next prompt, as after a compaction.
  memory?: string;
  // The project list for the hub, kept like `memory`.
  projects?: string;
}>({
  kind: 'bica.session',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'current',
  initial: () => ({ title: '', createdAt: 0 }),
});

export const profileOf = (meta?: { profile?: ProfileId }) =>
  meta?.profile ?? 'coding';
