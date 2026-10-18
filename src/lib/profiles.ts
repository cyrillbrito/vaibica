// A session's profile (docs/profiles.md): what kind of session it is. The
// server adds each one's tools, instructions, and model (src/server/profiles/definitions.ts).
// A session is Coding or, as a toggle, Assistant. Only the hub's own page
// makes a Hub session (src/server/sessions/hub.ts). Night is a session held
// for tonight's run, and turns back into Coding once it ran (docs/night-runs.md).
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
    about: 'Keeps going for months in one project, with memory in files',
    panels: true,
    longLived: true,
  },
  night: {
    label: 'Night',
    about: 'Runs alone at night, without questions, and ends with a report',
    panels: true,
    longLived: false,
  },
  hub: {
    label: 'Hub',
    about: 'Coordinates other sessions and does no work itself',
    panels: false,
    longLived: true,
  },
} as const;

export type ProfileId = keyof typeof PROFILES;

export const ASSISTANT_HINT =
  'Assistant mode: for a session that keeps going, such as notes or a small coordinator in this project. It compacts on its own and keeps memory in files. Less about code, more about help.';

export const isProfile = (value: unknown): value is ProfileId =>
  typeof value === 'string' && Object.hasOwn(PROFILES, value);
