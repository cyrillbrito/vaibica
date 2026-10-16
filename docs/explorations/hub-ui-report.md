# Hub UI: report

Work on branch `hub-session-ui`. Delete this file before merging if it isn't wanted in `docs/`.

## What changed

- `/hub` is the hub's own page (`src/routes/hub.tsx`): a top bar with the hub icon, its status, and a link to its settings, then the thread board, then the chat. The first visit starts the hub, or opens Settings when it has no folder.
- `src/components/hub/HubBoard.tsx`: the hub's threads, sorted by what needs you. A thread is a session the hub started (`startedBy`), or any open session that asks or failed.
- `src/components/hub/HubChat.tsx`: transcript, queue, composer, and voice call. No fork, compaction, model picker, or profile switch.
- `/s/<hub id>` redirects to `/hub`, so notifications and "Started by" links land there.
- The sidebar's Hub row and the palette's Hub action link to `/hub`. The row is pinned on top, has an accent icon, and shows as selected on `/hub`. The old `goToHub` helper is gone; the page starts the hub.
- The message renderer moved out of `src/routes/s/[id].tsx` into `src/components/MessageRow.tsx`, unchanged except that its fork button is optional.
- Demo test data has a hub with six threads: `/hub?data=demo`.

Normal sessions are untouched: the earlier hub guards in the context chip, the palette, and the session page were reverted, since the hub no longer uses that page.

## Shared components still reused

- `MessageRow`: the transcript renderer for every message kind (tool calls, thoughts, questions, notes from other sessions). Copying it would fork 300 lines that must stay in step with the transcript format.
- `Composer`, `Queue`, `CallBar`: the input, queued prompts, and voice call. They are already generic and take their actions as props.
- `TopBar`: the app's bar on every page (settings, projects, terminals), holding the sidebar toggle. Not the session header: the hub page builds its own title.
- `StatusDot`: the one status symbol, so the board matches the sidebar.

## Hidden for the hub, and other actions worth a decision

Hidden: fork (menu, per-answer button, palette), compact now and the compact nag, switch to Coding or Assistant, the model picker, rename, and the context chip.

Left as they are, for you to decide:

- Archive: the sidebar's Hub row has no menu, and the palette's "This session" actions don't show on `/hub`, so the hub can't be archived from the UI now. Archiving it would start a fresh hub on the next visit and lose its transcript.
- Mark as unread: makes little sense for the hub.
- Clean up old output and the context breakdown: Tau does both on its own for long-lived sessions. The hub page has no context chip, so its size and cost are not visible anywhere now. A small read-only size readout may be worth adding.
- Voice settings: lived in the context chip menu, so the hub's voice can't be tuned from its page now.

## Next

- Show the hub's `MEMORY.md` board (purpose and next step per thread) next to the live status. That needs a read of the hub folder, which the UI has no topic for yet.
- A count of threads that need you on the sidebar's Hub row.
- Wider screens: the board could sit beside the chat instead of above it.
- Quick actions on a thread row, such as answering a question in place.
