# Why the hub reports vaguely and waits, and the fix

The push rules below went too far: the hub started and steered sessions on its own. [hub-proactivity-fix.md](./hub-proactivity-fix.md) replaces them with propose-and-wait. The reading and reporting rules still hold.

The hub said "idle" where it should have said what each session waits on, and it waited for the user when it could have moved work forward. Three things caused it: its instructions told it to answer from notes and read sessions only when asked, its tools hid what a session waits on and hid archived sessions, and its rules for worker reports never told it to check the work or push the next step.

## How the hub works

- Instructions: `buildHubInstructions` in `src/server/instructions.ts` renders `HUB_PREAMBLE`, then `<tools>` (`HUB_TOOLS`), `<hub>` (`HUB`), the project's AGENTS.md, `<memory>` (`MEMORY.md` from `loadMemory`), `<projects>` (`hubProjects`), `<cwd>`, and `<replies>` (`REPLIES`, shared with every profile). `src/server/profiles.ts` picks it for the hub profile. Memory and projects are taken at start and after each compaction only, for the prompt cache.
- Tools: `HUB_EXTENSIONS` in `src/server/harness.ts` gives the hub `HubFileTools` (read anywhere, write and edit in its folder), `HubSessionTools`, and `ask`. It has no bash and no codemode, so it can't run `git log` or grep.
- Session tools, `src/server/session-tools.ts`, built by `sessionTools(hub)`:
  - `list`: a tree of projects, workspaces, open sessions, and terminals. Status words come from `STATUS`, where `done` (finished, unread by the user) and `idle` both printed "idle". Archived sessions were left out, with no way to see them.
  - `session_read`: title, folder, status, the `ask` questions when waiting, and by default only the last reply (`messages` raises it, up to 50, without tool calls). It didn't say who started the session or that it was archived.
  - `session_send`: refuses archived sessions ("Ask the user before bringing it back"). There is no unarchive tool, though `archive(id, false)` exists in `src/server/sessions.ts`.
- Notes, `src/server/sessions.ts`: `runChanged` sees a run end, `runEnded` builds the note ("finished its turn. Its last reply: …", the questions when waiting, the reply on error) for the starter, one-off watchers, and every hub on a question or error, and `tell` queues it as a prompt starting `[Note from Bica, not from the user]`, merging notes that wait. A session that messaged its watcher during the run sends that watcher no note, unless it asks or fails.
- Worker reports: `session_start` appends "To report back or ask it something, use session_send" to every ticket. So workers usually report with a `[Message from session …]`, and the note is then skipped. The music session's report reached the hub this way.

## Causes, per failure

1. "What are the states of the sessions": the hub listed raw states.
   - `HUB`: "Answer from your memory files when you can. Call session_read only for the thread the user asks about, and `list` when you need live status." A question about all sessions isn't "the thread the user asks about", so it called `list` only.
   - `HUB`: "Status always comes from `list`." It treated `list` as the full answer.
   - `HUB`: "Never list every project or session: say "3 sessions wait on you, the rest are idle"…" The example is the vague reply the user complained about.
   - `list` printed "idle" for both finished-unread and truly idle sessions, so even the state was less than Bica knew.
2. The archived music session: it couldn't find it and asked which project.
   - `list` hid archived sessions and had no option to show them. With no bash, the hub had no other way to search.
   - No line told it to search before asking, or to offer its best match.
3. "Do you want me to have the session look for an iPhone fix?" with no pick.
   - `HUB`: "Answer a worker's question yourself only when the user or your notes already settled it. Otherwise bring it to the user." Every open decision goes back to the user.
   - `HUB`: "tell the user only what needs him: a question, an error, or finished work he asked for." Being asked framed its role as a relay.
   - `REPLIES` says "For a choice, give 2 to 4 options, your pick first", but a yes/no question didn't read as a choice, and its example ends on "Should I make the change?". `HUB` had no rule of its own about recommending.
4. It waits after a session finishes, even its own.
   - The `Notes from Bica` rules said: on a note, update the board and tell the user. Nothing said to check the result or send the next step.
   - Those rules spoke only of notes, while its own workers report with `session_send`, so their reports fell under no rule.
   - Notes and `session_read` didn't say whether the hub started the session, and `list` was the only place to find out.
   - The board example ("done, diff ready. Next: you review.") showed no specifics and no pick.

The short-reply rules in `REPLIES` were not a cause on their own: 2 to 6 lines and one list of 5 points fit "say what each of 3 sessions waits on". The problem was the `HUB` lines above, which used brevity as the reason not to read.

## Prompt changes, before and after

All in `HUB` and `HUB_TOOLS` in `src/server/instructions.ts`. `REPLIES` is unchanged, so its limits (answer first, 2 to 6 lines, one list, no full paths) still hold.

Job:

- Before: "Answer from your memory files when you can. Call session_read only for the thread the user asks about, and `list` when you need live status."
- After: "Your notes say why a session exists. Only the session says where it stands. Before you say what a session is doing or waiting on, session_read it, and read several at once when you need several. Pass `messages: 3` or more when you also need its task. Answer from your notes alone only what they hold, like decisions and preferences."
- New: "You help the user get things done. A thread you started is yours until he closes it: when its worker reports, check the work and set the next step going yourself. Bring him only what truly needs him."
- New: "Before you ask the user where something is or which one he means, look for it: your board and area notes, `list`, `list` with `archived`, and session_read on the likely matches. Then act on the best match, or ask with it as your pick."
- Added to "One session per thread": "An archived session can be read but not messaged: to go on with it, ask the user to bring it back, or start a new session whose ticket carries what the old one found."

Handoffs:

- Before: "status, result, where the details are, and what's next"
- After: "status, result, the checks it ran and what it couldn't check, where the details are, and what it needs next and from whom"

Memory:

- Before: board lines hold "status, and next step with whose move it is", example "done, diff ready. Next: you review."
- After: "status, and what it waits on: whose move it is and exactly what that move is", example "fix committed, types pass, not tried in a browser. Waits on: you, to review the diff. My pick: merge."
- Before: "Status always comes from `list`."
- After: "Live status comes from `list`, and what a session waits on from its last reply, through session_read."

Notes and reports (was "Notes from Bica"):

- New: workers' `session_send` reports are treated the same as notes.
- Before: "On a note, update the board, then tell the user only what needs him: a question, an error, or finished work he asked for. Anything else gets one short line."
- After, for a session it started or messaged: 1. check the report against the ticket (done reached, checks run, what was skipped), reading the files it points to; 2. when the next step follows from the goal and is easy to undo, send it or start the next session; 3. update the board and tell the user what finished, what it checked, what it set going, and what waits on him. "A note that needs nothing from the user and changes nothing gets one short line" stays.
- Before: "Answer a worker's question yourself only when the user or your notes already settled it. Otherwise bring it to the user."
- After: "Answer a worker's question yourself when the user's words, your notes, or the code settle it, or when one answer is clearly right and easy to undo, and tell the user in one line what you chose. Bring him the rest: taste, scope, money, risk, and anything hard to undo."
- New: "Sessions the user started himself are his: report their questions and errors, and push them only when he asks. Before you stop or archive one, ask him." This keeps the old ask-first line, and keeps the new push rules off his own sessions.

Talking to the user:

- New: "When he asks about sessions or work, read them first. For each one you name, say what it waits on and whose move it is, in specifics: "The palette session waits on your yes to add a search button to the top bar. I'd say yes, it's small." Never stop at "idle", "done", or "waiting on you", and don't explain Bica's states."
- Before: "…name at most 3 or 4 things, leading with what needs him. Never list every project or session: say "3 sessions wait on you, the rest are idle", name those 3, and offer the rest."
- After: "Name at most 3 or 4 things, leading with what needs him, then what you are pushing. Sum up the rest in one line by what they wait on ("two more are finished and need nothing"), and offer them."
- New: "Every question you put to him carries your pick and its reason, in one sentence. When your pick follows from what he asked for and is easy to undo, don't ask: do it and say so."
- The no-full-paths line is unchanged.

Possible conflicts, checked: "do it and say so" covers only what is easy to undo, so `REPLIES`' "before anything destructive or irreversible, confirm" still wins. Reading sessions first doesn't lengthen replies, since the per-session lines fit `REPLIES`' one list of up to 5. The hub still does no work itself: verifying means reading reports and files, or asking the worker for a check.

## Tool and note fixes applied

- `list` and `session_read` say "idle, with a reply the user hasn't opened" for finished-unread sessions instead of "idle". This changes the wording for coding sessions too.
- `list` takes `archived: true` and lists the last 50 archived sessions, newest first, with id, title, folder, date, and "started by you". It is read-only. `session_read` already read archived sessions, and now says "archived".
- `session_read` says who started the session ("You started it." or "Session N started it.").
- Notes say ", which you started," when the watcher is the session's starter.

## Decisions for the user, not built

- Unarchive for the hub: a `session_unarchive` tool, or letting `session_send` bring a session back. It is one call to `archive(id, false)`, but whether the hub may bring sessions back on its own is your call. Until then the prompt tells it to ask, or to start a new session with the old one's findings.
- Search for the hub: it has no bash, so it can't run `git log` or grep projects for a missing session. A read-only search tool (git log, file names) would help, but goes against the "no shell" choice in docs/hub.md.
- A "waits on" field in `list`, such as the first line of each session's last reply, would save a read per session. It costs tokens on every `list`, so it's left out for now.
- Notes still carry the full last reply, which is right for checking the work, but long reports fill the hub's context. Asking workers for short reports is the current answer.

## Test

A script ran the old and the new hub instructions on Claude Sonnet 5.5, the hub's default model, with fake tools that return the real sessions' replies from the failing conversation. It ran once per case, so these are signs, not proof.

- Session states. Old: one `list`, then "The rest are idle… Should I read the music and palette reports?", which is failure 1 again. New: `list`, then session_read on the music, palette, and hub UI sessions, and for each one what it waits on and a pick ("It waits on your yes… I'd say yes, it's small").
- The archived music session. Old: "It isn't open anywhere in Bica, so it was probably archived" and offers a fresh session with no memory of the old one. New: `list` with `archived` finds 59418, says it can read but not message it, and recommends a new session that carries over what the old one found.
- The music worker's report. Old: passes it on and ends on "Do you want the iPhone case fixed, or is a plain cutoff fine there?" with no pick. New: reads the session first, puts what it waits on on the board, and ends with "I'd merge it as is and leave the iPhone problem for later."

Still weak: in the states case, the new hub skipped reading a session it didn't start that had an unopened reply with a question (the blackjack split). It named that session as unread instead of saying what it asks. One line in the prompt was tightened for this ("every one that runs, waits, or has a reply he hasn't opened"), and the rerun still skipped it. It also kept using bold labels, which `REPLIES` already forbids. With the music report, it recommended but had no clear step to send the worker, so the "push the next step" rule wasn't tested on a case that needed it.
