# Sessions

A session is one conversation with an agent. It runs in one workspace ([projects.md](./projects.md)), with its own model and effort, a transcript, and a queue of prompts. You can run many at once and watch them all stream.

Sessions run on Pi Durable, which saves every turn and tool call before anyone sees it. A crash or restart loses nothing, and unfinished runs pick up where they stopped.

## Starting one

The home page's composer picks a workspace, a model, and whether to turn on [assistant mode](./assistant-mode.md), then starts the session with your first prompt. The moon button holds the prompt for tonight's [night run](./night-runs.md) instead. The fast model names the session, and renaming by hand wins. Model and effort can change at any time, for that session only. Defaults live in Settings ([models.md](./models.md)).

## The transcript

The transcript shows your prompts with their images, the agent's replies, its thinking, tool calls, errors, and compactions.

- Thinking and tool calls between two replies fold into one activity list, with a header such as "Worked for 18s · 6 tools, 1 thought". Each call opens to its command and output, its diff, or its arguments.
- Running calls show a spinner, slow ones a timer, and failed ones say "Failed" in red.
- Before the first words stream, a "Working" pill sits at the bottom. A provider error waiting to retry shows there too, with a countdown.
- Hover a reply to copy or fork it. Code blocks get their own copy button.
- Notes from Bica and messages from other sessions show as a quiet row with the sender.
- Hide thinking, in Settings → Appearance, leaves thinking out on that device.

`bun scripts/demo-session.ts` seeds a session with every kind of row.

## Queue, push, stop

While the agent works, sending queues the prompt as a follow-up, which starts the next run. Follow-ups sit on a tray above the composer, and every tab sees the same queue.

- Push turns a follow-up into a steer, which joins the current run after the turn in progress. ⌘Enter sends a steer straight away.
- Edit takes a prompt back into the composer, and Remove drops it.
- Stop ends the run, and follow-ups come back into the composer. Esc twice in the composer stops too.
- A run that fails doesn't hold up the queue: the next follow-up runs anyway, so notes to an unwatched session still get read.

## Who's in charge

A worker, a session another session started, is in its parent's charge at first: the parent gets a note after every run. A strip above the composer says "Parent in charge".

- Sending takes over, so the send button reads "Take over". From then on the parent hears nothing more, and can't message or stop it unless you tell it to.
- The arrow beside the send button holds a plain Send, which leaves the parent in charge and gives it a copy of your words.
- Answering a question the session asks doesn't take it over.
- Hand back, in the strip, returns the session to the parent with its last reply.

## Composer

- Each session, the home page, and each workspace page keep their own draft on the device. Attached images last until a reload.
- ↑ at the very start of the box steps back through the prompts you sent, and ↓ at the very end steps forward again.
- A long paste folds into a marker like `[Pasted text #1 · 40 lines]` and goes out in full.

## Forks

A fork is a new session with another one's history up to a chosen reply. It runs in the same workspace, so files are shared, not rolled back.

## Status

Each session in the sidebar shows its status:

- Running: the agent is working.
- Retrying: the provider failed, and Pi Durable will try again.
- Failed: the last run ended in an error, or its work is stuck.
- Waiting for you: the agent asked a question.
- Unread: finished with a reply you haven't opened.
- Idle: everything else.

The right end of a row shows a live clock while it runs, a tag when it needs you, or how long ago it last moved. Needs you means waiting for you, unread, or failed. Tabs on top of the sidebar filter to All or Needs you, which also keeps running sessions and any that moved in the last few minutes. The home page stacks the sessions that need you under the composer, most urgent first.

Work is stuck when Pi Durable won't run it. Work that was cut off by crashes too many times in a row, such as a tool that runs Bica out of memory, is paused instead of crashing Bica again. Work whose code is gone from Bica, such as a removed extension's tool, can't run at all. A strip above the composer says which, with Retry for paused work. Stop ends either.

Read state lives on the server, so opening a session on the phone marks it read on the laptop too. A chime plays when a session stops, different for done, asking, and failed. The installed app's icon shows a badge with the sessions waiting or unread.

## Archiving

Archive moves a session to the sidebar's Archived section, and unarchive brings it back. Nothing is deleted. A running session can't be archived. Archiving a session that started others asks which of them go with it.

To archive many at once, ⌘ click or shift click sessions in the sidebar, then use the bar at the bottom.
