# Night runs

A night run is a session held for tonight. Its prompt waits until the night start time in Settings, then runs on its own while you sleep, and the session ends with a report for the morning. It is for work that can wait and finish without you, so a day that used up the plan's 5-hour window leaves the night's windows for the rest.

## Holding one

The moon button on the home composer holds the typed prompt instead of sending it. Its sidebar row shows a Tonight tag.

The held session's composer edits that one prompt, with no second message to queue. The box holds the prompt, and edits save as you type. Enter adds a line rather than sending, and Run now sends the box as it is now. A strip above it says when the run starts, and its × drops the run and leaves the text as a normal draft. A held prompt is text only, so images and voice calls are off. Every other way to send to it, such as `session_send`, is refused until it runs.

Other sessions can hold one too, through `session_start` with `tonight` ([tools.md](./tools.md)). That is how the hub schedules work you dictate from the phone. Editing or running it doesn't take it over: it goes out as its starter's, so the hub still hears of the run and gets the report.

## What runs

A held session is a Night [profile](./profiles.md). It is a coding session without `ask`, since nobody can answer, and at high effort or more. Its rules tell it to push on to the goal instead of stopping to ask, to take easy-to-undo choices and note them, to prove the work with commands and never claim a check it didn't run, and to stay out of push, merge, and deploy. It commits only when the prompt asks, as any coding session does. It writes files when the task calls for one, such as a research report.

Its short replies are swapped for a morning report, in the same writing style: the status (done, partly done, or blocked) first, then what changed, the checks and their results, what it couldn't check, decisions it took alone, open questions, and the next step. Once the run ends, the session turns back into a coding session, so you continue it in the morning like any other, with `ask` back.

## When it runs

The server checks every minute.

- Runs start only within one 5-hour window after the start time, so a late one can't spill into the morning's window. Held sessions left over wait for the next night.
- One runs at a time, oldest first. Parallel runs would share one rate limit and drain the week twice as fast.
- A run starts only while the plan behind its model has room: not blocked, and with a reserve of the week left for the next day. Only [CLIProxyAPI](./proxy.md) plans report their limits; on other providers it starts without a check.
- A run that goes on too long is told to wrap up and write its report, and is stopped a while later.

Pick a start time at least 5 hours before your day starts. A Claude window starts at the first message, so the night's window then ends before yours begins.

## Sources

- [claude-overnight](https://github.com/rohanprichard/claude-overnight): a night queue that checks the plan meter before each job and keeps a reserve.
- [claude-nightshift](https://github.com/dujunyi416/claude-nightshift): night jobs timed to the plan's reset.
- [Codex Automations](https://developers.openai.com/codex/app/automations): unattended runs that report to an inbox.
- [Agent PRs by task type](https://arxiv.org/html/2602.08915v2): chores, docs, and refactors merge far more often than features, which is what to hold for the night.
- [Why agent fix PRs go unmerged](https://arxiv.org/html/2602.00164) and [an 8-hour overnight run](https://blog.devaubree.fr/en/blog/agent-autonome-nuit-retour-experience/): unattended agents claim work they never did, hence checks by command and a report.
- [Anthropic's long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): one goal, a check that proves it, and a clear end.
- [Mitchell Hashimoto's end-of-day agents](https://mitchellh.com/writing/my-ai-adoption-journey): handing off slow, low-risk work before leaving.
