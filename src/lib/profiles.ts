// A session's profile (docs/profiles.md): what kind of session it is. The
// server adds each one's tools, instructions, and model (src/server/profiles/definitions.ts).
export const PROFILES = {
  coding: {
    label: 'Coding',
    about: 'Works on code with every tool',
    // The Git, files, and terminal panels.
    panels: true,
    // Bica cleans up and compacts it while idle (src/server/profiles/upkeep.ts).
    longLived: false,
  },
  assistant: {
    label: 'Assistant',
    about: 'Runs for months, with memory in files',
    panels: true,
    longLived: true,
  },
  hub: {
    label: 'Hub',
    about: 'Coordinates other sessions and does no work itself',
    panels: false,
    longLived: true,
  },
} as const;

export type ProfileId = keyof typeof PROFILES;

export const isProfile = (value: unknown): value is ProfileId =>
  typeof value === 'string' && Object.hasOwn(PROFILES, value);
