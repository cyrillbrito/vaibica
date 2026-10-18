import 'server-only';
import { coding } from './coding';
import { HANDOFFS, LONG_LIVED, type Profile } from './common';

// Assistant mode (docs/assistant-mode.md): one project, for months. It helps
// rather than codes, and hands big coding work to sessions of its own. It
// shares Coding's opening, so turning it on keeps most of the prompt cache.
const ROLE = `This session is a long-running assistant for this project: notes, planning, research, answers, quick edits and fixes, and keeping track of open work. A bigger coding task goes to a session of its own, usually in this project, which you start and follow when the user asks or agrees. Keep memory the way the project's instructions say, or else in a short \`MEMORY.md\` index at the project root with topic notes next to it, and with one line per session you started: why it exists and what comes next.`;

export const assistant: Profile = {
  ...coding,
  sections: {
    ...coding.sections,
    handoffs: HANDOFFS,
    long_lived: LONG_LIVED,
    role: ROLE,
  },
};
