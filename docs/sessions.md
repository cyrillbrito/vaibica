# Sessions

A session is one conversation with an agent. It runs in one workspace, with its own model and effort, a transcript, and a queue of prompts. You can run many at once and watch them all stream.

## Durable by design

Sessions run on Pi Durable, inside the server. Every step the agent takes is saved to SQLite before anyone sees it, and the UI only shows what is saved. A crash or restart loses nothing: unfinished runs pick up where they stopped. The storage favors speed, so a power cut may lose the last few steps, but a crashed process doesn't.

## Starting one

The home page's composer picks a workspace, a model, and whether to turn on [assistant mode](./assistant-mode.md), then starts the session with your first prompt. The fast model names it in the background, or the prompt's first words do. Renaming by hand wins. Model and effort can change at any time, and new sessions start from the defaults in Settings. A pick on the composer or in a session applies to that session only; only Settings changes the default.

## The transcript

Images are pasted, picked, or dropped on the composer. The transcript shows your prompts with their images, the agent's replies as Markdown, its thinking, tool calls, errors, and compactions.

- Thinking and tool calls between two replies fold into one activity list. Each call opens to its command and output, its diff, or its arguments.
- Past one step, the list gets a header that sums it up: "Working" while it runs, with a timer once the run gets long, then "Worked for 18s · 6 tools, 1 thought" and how many failed. It folds the list, and long finished lists load folded.
- Running calls show a spinner, and a timer once they get slow. A call you watch finish draws a check, slow ones keep their time, and failures say "Failed" in red. The server stamps the times, so every tab agrees.
- An opened call shows its parts (command, arguments, output, error) each with a copy button. JSON is highlighted, and long blocks stop at a fade with "Show all".
- Before the first token streams, a "Working" pill sits at the bottom, with a timer once the wait gets long. A provider error waiting to retry shows there too, with the countdown.
- New paragraphs of a streaming reply fade in. Code blocks in replies get a copy button on hover.
- Under an answer, copy and fork appear on hover; copy turns into a check instead of a toast. Your prompts copy the same way, next to their time.
- Notes and messages from other sessions show as a quiet row with the sender, not as your prompt.
- Hide thinking, in Settings → Appearance, leaves thinking out of transcripts on that device.

`bun scripts/demo-session.ts` seeds a session with every kind of row.

## Queue, push, stop

While the agent works, sending queues the prompt for the next run, and the send arrow turns into a queue icon. Queued prompts sit on a tray above the composer. The queue is part of the conversation, so every tab sees the same one.

- Push turns a queued prompt into a steer, which joins the current run after the step in progress. ⌘Enter (Ctrl+Enter) in the composer sends a steer straight away.
- Edit takes a prompt back into the composer, and Remove drops it.
- Stop ends the run at once, and queued prompts come back into the composer. Esc twice in the composer stops too. Twice, so an Esc meant to close something can't stop a run.

## Composer

- Each session keeps its own draft, and so do the home page and each workspace page. Drafts are kept on the device, so they survive a reload. Attached images stay only until the page reloads.
- ↑ with the caret at the very start steps back through the prompts this browser sent, from every session, and leaves the caret at the start, so the next ↑ goes further back. ↓ at the very end steps forward the same way, and past the newest brings back what you had typed. Anywhere else, the arrows just move between lines. A held arrow never crosses from moving lines into the history: it stops at the first or last line, and the next press goes on. The history is kept on the device.
- A long paste folds into a marker like `[Pasted text #1 · 40 lines]`, and goes out in full when you send. Pi Pocket does the same.

## Forks

A fork is a new session with another one's history up to a chosen answer. It runs in the same folder, so files are shared, not rolled back.

## Status

Each session in the sidebar shows its status with shape and color together:

- Running: the agent is working.
- Retrying: the provider failed, and Pi Durable will try again.
- Failed: the last run ended in an error.
- Waiting for you: the agent asked a question. It stays until you answer.
- Unread: finished with an answer you haven't opened.
- Idle: everything else.

The right end of a row says what matters about it: a live clock while it runs (since the prompt that started the run), a tinted tag when it waits for you, failed, or is retrying, and otherwise how long ago it last moved. A status you watch change pops its new shape in. Tabs on top of the sidebar filter the list to All or Needs you (waiting for an answer, failed, unread, running, or recently active), with a rolling count. Pointing at a tab fades the rows it would leave out. The open session stays listed under any filter.

The home page stacks the sessions that need you under the composer, most urgent in front: waiting, then failed, then unread. × on a finished one marks it read, and on the others it hides the card until the session changes. With nothing in progress, a few first steps show there instead, until closed.

The read marker lives on the server, so opening a session on the phone marks it read on the laptop too. A session's menu can mark it unread again. A short chime plays when a session stops running, different for done, asking, and failed.

The installed app's icon shows a badge with the sessions the sidebar marks as waiting or unread, without archived ones. Failed sessions don't count, because they stay failed after you've read them. The open app keeps the count current. iOS shows the badge only for apps allowed to send notifications, so there it stays hidden.

## Archiving

Archive hides a session in the sidebar's Archived section, and unarchive brings it back. Nothing is deleted. A running session can't be archived, since hiding something that still spends tokens would be a surprise.

To archive many at once, pick sessions in the sidebar with ⌘ click (or Ctrl click) to add one, and shift click to take every row between it and the last one clicked. A bar at the bottom of the sidebar then archives or unarchives them all, and so does right click on any picked row. Running sessions are skipped. A plain click or Esc clears the pick.

## Related

- [tools.md](./tools.md): what the agent can do, including working with other sessions.
- [instructions.md](./instructions.md): the agent's instructions and skills.
- [context-usage.md](./context-usage.md): the context window, cache, spend, and compaction.
- [voice.md](./voice.md): talking to a session.
