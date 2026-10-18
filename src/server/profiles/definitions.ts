import 'server-only';
import type { Extension } from '@earendil-works/pi-durable';

import type { ModelChoice } from '#lib/protocol';
import type { ProfileId } from '#lib/profiles';
import { HUB_EXTENSIONS, NIGHT_EXTENSIONS } from '#server/agent';
import { defaultChoice } from '#server/providers';
import { hubChoice } from './hub';
import { hubProjects } from './instructions';

/** What a session runs with under a profile (src/lib/profiles.ts). */
export interface ServerProfile {
  // null: the host default from src/server/agent/harness.ts, every tool but the hub's.
  extensions: Extension[] | null;
  /** The model it starts on. */
  choice(): Promise<ModelChoice>;
  /** The project list for its instructions, '' for none. */
  projects(): Promise<string>;
  // Sessions it starts take its model. The hub's is picked for routing.
  passesModel: boolean;
  // Hears when any session asks or fails, not only its own (docs/hub.md).
  hearsAlerts: boolean;
}

const none = async () => '';

const PROFILES: Record<ProfileId, ServerProfile> = {
  coding: {
    extensions: null,
    choice: defaultChoice,
    projects: none,
    passesModel: true,
    hearsAlerts: false,
  },
  assistant: {
    extensions: null,
    choice: defaultChoice,
    projects: none,
    passesModel: true,
    hearsAlerts: false,
  },
  night: {
    extensions: NIGHT_EXTENSIONS,
    choice: async () => nightChoice(await defaultChoice()),
    projects: none,
    passesModel: true,
    hearsAlerts: false,
  },
  hub: {
    extensions: HUB_EXTENSIONS,
    choice: hubChoice,
    projects: hubProjects,
    passesModel: false,
    hearsAlerts: true,
  },
};

export const serverProfile = (id: ProfileId) => PROFILES[id];

const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/**
 * At least high effort: with nobody to come back to, the agent should push
 * on to the goal rather than stop early (docs/night-runs.md).
 */
export const nightChoice = (choice: ModelChoice): ModelChoice =>
  LEVELS.indexOf(choice.thinkingLevel) < LEVELS.indexOf('high')
    ? { ...choice, thinkingLevel: 'high' }
    : choice;
