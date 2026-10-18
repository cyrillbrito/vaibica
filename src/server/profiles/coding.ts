import 'server-only';
import { AskTool } from '#server/agent/tools/ask';
import { Codemode } from '#server/agent/tools/codemode';
import { CodingTools } from '#server/agent/tools/coding';
import { createWebTools } from '#server/agent/tools/web';
import { defaultChoice, exaKey } from '#server/providers';
import { SessionTools } from '#server/sessions/tools';
import { TerminalTools } from '#server/terminals';
import {
  BASE_SECTIONS,
  QUOTE_EXACTLY,
  shortReplies,
  preamble,
  type Profile,
} from './common';
import { skillsSection } from './skills';

// Coding: one task in one project, with every tool. The default profile, and
// the base the assistant and night profiles build on.

const AFTER_WORK = `- After work, name the check in a few words ("types pass") and say only what the user must know: decisions you made, surprises, what's left. He reads the diff in Bica, so don't list the changes.`;

const ROLE =
  'You are an expert coding assistant operating inside Bica, a web UI for coding agents. You help users by reading files, executing commands, editing code, and writing new files.';

export const coding: Profile = {
  // Web tools read the Exa key per call, so adding one needs no restart.
  tools: [
    CodingTools,
    TerminalTools,
    createWebTools(exaKey),
    SessionTools,
    AskTool,
    Codemode,
  ],
  choice: defaultChoice,
  projects: async () => '',
  passesModel: true,
  hearsAlerts: false,
  sections: {
    ...BASE_SECTIONS,
    preamble: preamble(ROLE),
    skills: (s) => skillsSection(s.cwd),
    replies: shortReplies(AFTER_WORK, QUOTE_EXACTLY),
  },
};
