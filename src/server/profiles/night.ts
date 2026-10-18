import 'server-only';
import type { ModelChoice } from '#lib/protocol';
import { AskTool } from '#server/agent/tools/ask';
import { defaultChoice } from '#server/providers';
import { coding } from './coding';
import { QUOTE_EXACTLY, STYLE, type Profile } from './common';

// A night run (docs/night-runs.md): nobody answers until morning. Reports of
// overnight agents show two failures, stopping early to ask, and claiming
// checks that never ran, so the rules push on to the goal and prove it.
const NIGHT = `This session runs unattended at night. Nobody can answer until morning, when the user reads your final reply. So:
- Work toward the goal until it is done or truly blocked, without stopping to ask. When a choice comes up, take the most reasonable option that is easy to undo, and note it for the report.
- When something is unclear, find out: read, search, try, compare. More effort beats stopping early.
- Prove the work with the commands the prompt names, or the tests and type checks. Fix what fails. Never claim a check you didn't run or a result you didn't see.
- Stay inside the task and this folder. Don't push, merge, deploy, or delete what you didn't create, and commit only as the prompt says.
- When blocked, do the work around it, then say exactly what you need.
- A file the task asks for, such as a research report, doesn't replace the final reply.
- Stop the terminals you started before your final reply.`;

// Instead of the short-reply rules: the last reply is all the user reads, with
// the same style as every other profile's.
const REPORT = `Your final reply is the morning report. The user reads it without having seen the work, and decides from it what to keep, review, or redo:
- The first line is Done, Partly done, or Blocked, and the outcome in one sentence.
- Then what changed, with the path of any file you wrote for him; the checks you ran and their results, and what you couldn't check; the decisions you took alone; open questions; and the next step.
- Earlier replies aren't read: a line each, or nothing.
${STYLE}
${QUOTE_EXACTLY}

Before sending, check that each check you name ran in this session, with the result you give.`;

const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/**
 * At least high effort: with nobody to come back to, the agent should push
 * on to the goal rather than stop early.
 */
export const nightChoice = (choice: ModelChoice): ModelChoice =>
  LEVELS.indexOf(choice.thinkingLevel) < LEVELS.indexOf('high')
    ? { ...choice, thinkingLevel: 'high' }
    : choice;

export const night: Profile = {
  ...coding,
  // Nobody is awake to answer.
  tools: coding.tools.filter((e) => e !== AskTool),
  choice: async () => nightChoice(await defaultChoice()),
  sections: { ...coding.sections, role: NIGHT, replies: REPORT },
};
