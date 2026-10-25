# Recap

The Recap tab shows where one session stands: what it's for, what the agent does now or waits for, what's done, and what likely comes next. It sits in the side panel next to Files and Git, on a session's page only. It's an experiment, so it lives in its own folders, `client/src/recap/` and `server/src/recap/`, and removing those and their lines in the side panel, the socket table, and `protocol.ts` takes it out whole.

## What you see

- The recap. The fast model reads your prompts, the agent's replies, and each tool call's name and summary, and writes the goal, a line for now, up to four things done, and up to three likely next. Tool inputs and outputs stay out: the summaries already say what each call was for. Under it are when it was written, by which model, and its cost; point at that line for the tokens and time.
- Changed files: what this session's edit and write calls touched, Code mode's included, newest first, with how often. A long list folds behind Show all. Changes made through bash show only in Git.
- Activity: prompts, tool calls, failures, how long the session ran, and the calls per tool.

Without a fast model, only the files and activity show.

## Why the agent keeps no plan

Agent to-do lists lock the agent into steps it wrote before it knew the work, and the big harnesses are dropping them for frontier models. What people missed when they went was the view, not the agent's focus. So the agent keeps nothing, and each recap is written fresh from what happened, which lets the plan change as the work does. [recap-tab.md](./explorations/recap-tab.md) has the research and the other option, an agent-kept plan.

## When a recap is written

When the tab opens, when the session's status changes, and on Refresh. While it runs, at most every few seconds once something new happened, so a quick run doesn't outgrow its "Next". The server keeps the last answer for the same transcript and status, and Refresh skips that.

## Sources

- Claude Code's `/recap`: the goal, the current task, and the next action, written by a side model when you come back.
- Windsurf's Planning Mode, where a second model keeps refining the plan while the main one acts, and Manus's planner agent.
- Claude Desktop's session rail, a column of cards for one session.
