# Composer and session page ideas

What the composer and the session page around it could do better, ranked by benefit for the cost. The top five are small, fix real friction when many sessions run at once, and mostly reuse what Bica already has. This doc leaves out three things built in another session (↑/↓ prompt history, folding long pastes, Esc twice to stop) and `@` file mentions.

## What Bica does today

This list comes from reading `src/components/Composer.tsx`, `src/routes/s/[id].tsx`, `Queue.tsx`, `Activity.tsx`, `ToolCalls.tsx` and `src/lib/stick-to-bottom.ts`.

- The composer sends with Enter on desktop and with the button on touch, attaches pasted or picked images, and clears itself before the send returns so typing can go on.
- While a run works, sending queues the prompt as a follow-up. The queue sits inside the composer, and each row has Push (turn it into a steer), Edit and Remove. Stop gives queued prompts back to the composer.
- The server already accepts `whenBusy: 'steer'` on `session.submit`, but the composer never sends it. Steering is only reachable by queueing and then pressing Push.
- The draft lives in an uncontrolled `<textarea>`, and the session page stays mounted when you switch sessions. So a draft typed in one session is still there after switching to another: checked in the browser with test data, where "draft for session one" showed in `/s/fixture-2`. A reload loses the draft.
- Thinking and tool calls between two replies form one activity card, with a 28px row per step (44px on touch). A run of 30 calls is a card of 30 rows, about 1300px on a phone.
- Between sending and the first streamed token, the transcript shows nothing. The only sign of work is the status dot in the top bar. With thinking hidden, that gap can last the whole run until the first tool call.
- Stick-to-bottom follows the end until you scroll up, and sending or switching sessions follows again. There is no button to get back to the end.
- The top bar holds the status dot, the title, GitButler's lane picker, the context meter, and the two panel toggles. The session's changed files (`session.changes`) only show in the right panel.
- Nothing focuses the composer when a session opens, and there are no keyboard shortcuts beyond ⌘B, ⌥⌘B and Esc.

## Top 5

### 1. A draft per session, kept across reloads

Each session keeps its own draft: switching sessions saves the box and restores the other session's draft, and the text is in `localStorage` under the session id, so a reload, a crash or iOS dropping the installed app keeps it. The home page keeps one draft of its own. A sent prompt clears its draft.

- Seen in Pi Pocket, which keeps "per-conversation composer drafts" in `localStorage` (`web/store.js`, `pocket.draft.<id>`), and in every chat app where a half-written message waits in its conversation.
- It fits Bica because switching between many sessions is the main loop, and today the draft follows you. Sending the wrong session a prompt meant for another is the worst outcome of that, and it is one Enter away. On a phone, Safari reloads a backgrounded app often, which loses whatever was typed.
- Cost: small. A `draftKey` prop on the composer, a save on input (or on switch and `pagehide`), and a restore when the key changes. Images can stay in memory only, since they would fill `localStorage`. The folded pastes from the other session need to go with the draft, as Pi Pocket keeps "each conversation's pastes by number, kept with its draft".

### 2. A live "Working · 12s" line at the end of the transcript

While a run works, the last line of the transcript says so: a spinner, a shimmering "Working", and the time since the run started. It shows only when nothing else live is on screen (no thinking or tool call streaming, no compacting row), so it fills exactly the silent gaps. On desktop it can add "Esc twice to stop", which also teaches the new shortcut.

- Seen in Codex CLI's status indicator ("Working (12s • esc to interrupt)", `codex-rs/tui/src/status_indicator_widget.rs`) and Claude Code's spinner line with elapsed time and tokens.
- It fits Bica because the gap between send and first token is where a session looks stuck, more so over Tailscale on a phone and with thinking hidden. The run's start is the last user prompt's timestamp, so the timer needs no new data, and `shimmer` and `SpinnerIcon` already exist.
- Cost: small. One row kind in `toMessages`, or a row after the list in `[id].tsx`, shown while `live.run` exists and the tail isn't already live. The timer ticks once a second, like slow tool calls do now.

### 3. Fold each activity into one summary line

An activity card collapses to one line that says what it did and how long it took, like "Thought, read 4 files, edited 2, ran 3 commands · 1m 12s", with the step rows inside. The live activity, and the newest one, start open; older ones start closed. Opening or closing one by hand sticks for the page's life.

- Seen in Pi Pocket 0.12 ("Turns, not cards": "Pi's thinking and tool calls fold into one line" with "a timeline of Pi's calls" inside, "the newest turn starts open"). Its `summarize()` in `web/turns.js` builds the sentence from a table of verbs and nouns per tool, counting distinct paths, so two edits to one file are "edited 1 file". Claude Code and Codex fold finished tool output the same way.
- It fits Bica because long runs are the norm, the transcript is the phone's only scroller, and what you want from an old turn is its prose, not its 30 rows. Bica already has the parts: `<details class="expand">`, the row chevron, per-call times stamped by the server, and the `stats` on edits for a "+12 −3" at the end of the line.
- Cost: medium. A summary function (about 40 lines for Bica's eight tools), a `<details>` around `Activity`, and open state that doesn't jump. To keep "nothing jumps", decide open or closed when the row mounts and never close one on its own: the live activity stays open after its run ends, until the page reloads or the session switches. Pi Pocket closes an older turn when a newer one arrives, which moves content above the reader; Safari has no scroll anchoring, so Bica should not.

### 4. A jump-to-latest button

When you scroll up in a running or long session, a small round ↓ button floats above the composer. Pressing it scrolls to the end and follows again. It hides once you are back at the bottom.

- Seen in ChatGPT on the web (users filed issues when the new desktop app dropped it: openai/codex#33768), Pi Pocket ("the jump-to-bottom button"), and shadcn's message scroller, whose button "re-engages follow-output".
- It fits Bica because reading back while an agent streams is common, and the way down on a phone is a long flick through expanded diffs. Stick-to-bottom already knows whether it follows; it only needs to say so.
- Cost: small. Expose `following` from `createStickToBottom` as a signal, and an `IconButton` with `appear` above the composer that calls `follow()`. The scroll should be instant, not smooth, since it can be thousands of pixels.

### 5. ⌘Enter steers while a run works

With a run going, Enter queues as now, and ⌘Enter (Ctrl+Enter elsewhere) sends the prompt as a steer, which joins the run after the current step. The send button's title says so while busy. When idle, ⌘Enter sends like Enter.

- Seen in Cursor (Enter queues, ⌘Enter sends now and "steers the active turn at the agent's next tool call"), Codex (Enter steers and Tab queues in the CLI; ⌘Enter steers in the app), and Claude Code (Ctrl+Enter "send queued messages now").
- It fits Bica because a correction ("not that file") has to land before the mistake, and today it takes a send and a Push, two actions on a moving row. The server already takes `whenBusy: 'steer'`.
- Cost: tiny. A `whenBusy` argument through `onSend` and `sendPrompt`, and one more key check. Push in the queue stays the touch path.

## More ideas, ranked

### 6. Your prompt rises in when you send it

A prompt that arrives while you watch fades in and rises 4px, with the existing `appear` (200ms, strong ease-out). Prompts already there when the transcript loads, or when you switch sessions, show at once. A queued prompt that leaves the queue and joins the transcript gets the same entrance. See Motion below for why this one passes and the rest don't.

- Seen in Pi Pocket ("what arrives while the session is open slides up into place: a message sent, or Pi starting to answer", 420ms) and shadcn's message scroller ("animate the user's message when it is sent… so it feels like it rises from the live edge").
- Cost: tiny, but `@starting-style` fires on every insert, including first load. It needs a "seen" flag like `StatusIcon`'s `ran` memo: rows added after the transcript first rendered get the class.

### 7. The session's changes in the top bar

A quiet "+42 −7" chip in the top bar for the files this session changed, which opens the right panel on Changes. It hides when the session changed nothing.

- Seen in Pi Pocket 0.12 ("a count of lines added and removed, which opens Changes"), and in Codex and Claude Desktop's diff badges.
- It fits Bica because review is a core goal, and on a phone the panel is a sheet you open blind. `session.changes` already carries `added` and `removed` per file.
- Cost: small. One subscription the inspector already makes, summed, and a button.

### 8. Focus the composer without reaching for it

On desktop, opening a session focuses the composer, and typing a printable key with nothing focused puts it into the composer. On touch, a tap anywhere on the composer's frame (its padding, the gap between the buttons) focuses the text, but opening a session never does, since that would raise the keyboard.

- Seen in ChatGPT (Shift+Esc focuses the input, and new chats focus it), Claude.ai (typing anywhere goes to the box), and Pi Pocket 0.11 ("a tap anywhere on the message box goes to the text").
- Cost: tiny. A guard on `pointer: fine` for focus on open, a `keydown` on the page that skips inputs, menus and modifier keys, and a `pointerdown` on the form that focuses the textarea when the target is the form itself.

### 9. Edit a sent prompt as a fork

A user prompt's context menu gets "Edit in a fork": it forks the session just before that prompt and puts the prompt's text and images into the fork's composer, unsent. The original stays as it was.

- Seen in Pi Pocket ("edit a message and send it again… Pi gets the edited message in a new session that forks just before the original"), Codex (Esc Esc on an empty composer to "edit your previous message and fork the chat from there"), and Claude.ai's message edit, which branches.
- It fits Bica because forks exist, and a misread prompt is easier to reword than to explain. Bica's forks share the folder and don't roll files back, so the menu item should say so in its hint, as `docs/sessions.md` does.
- Cost: small to medium. `forkSession` takes the entry before the prompt, and per-session drafts (idea 1) give the fork's composer somewhere to hold the text.

### 10. Jump to the next session that needs you

A shortcut goes to the next session that is waiting for an answer, failed, or finished unread, in sidebar order. ⌥↑ and ⌥↓ step through sessions.

- Seen in the Codex app ("Next chat needing attention", ⌘⌥A) and Pi Pocket (Alt+↑/↓ for the previous or next session, Alt+1–9 to jump).
- It fits Bica because with ten sessions running, the question is always "who needs me now". Statuses already exist on the server.
- Cost: small. It is desktop only, and switching must stay instant, with no animation.

### 11. Cap the queue's height

A long queue inside the composer pushes the transcript out of sight on a phone. Past three rows, the queue scrolls inside itself, or shows "and 4 more".

- Seen in Pi Pocket 0.12 ("the queue and the bars above the message box share the room with the conversation by measuring it, so a long queue… no longer push it out of sight").
- Cost: tiny. A `max-h` and `overflow-y-auto` on the list.

### 12. A list of shortcuts

Once ideas 5, 8 and 10 land, there are enough keys to forget. `?` with nothing focused, or a link in Settings, shows them.

- Seen in ChatGPT and Claude.ai (Ctrl+/) and Pi Pocket (`?`).
- Cost: small. Worth it only after the shortcuts exist.

### Left out

- A queue toggle between steer and queue as the default, as Cursor's setting and Pi Pocket's Steer/Queue switch do. One key for the other mode (idea 5) covers it without a setting.
- Ctrl+S to stash a draft (Claude Code). Per-session drafts cover most of it.
- Ctrl+G to edit in an external editor (Claude Code). Heavy editing already goes to VS Code, and the phone has none.
- Dictation with the browser's speech recognition (Pi Pocket 0.13). The phone keyboard dictates already, and voice calls exist.
- Drag to reorder the queue (Cursor). Rare, and fiddly on touch.
- ↑ from the first line taking back queued prompts (Claude Code). It fights the ↑ history being built; Edit on the queue row already does it.
- Copy the last reply with ⌘⇧C (ChatGPT, Claude.ai). The copy button under each answer covers it.

## Motion

Every candidate went through the gate in Emil Kowalski's find-animation-opportunities skill: how often you see it, what it's for, whether it fits the budget, and whether it helps the content. Sending, queueing and stopping happen tens of times a day, often from the keyboard, so almost everything fails on frequency. Two pass, one already exists, and the rest are rejected.

- Sending a prompt passes, as idea 6. Purpose: preventing a jarring change, since the box empties and the prompt appears elsewhere. It is seen tens of times a day, so it stays near the edge of noticing: the existing `appear` (opacity and 4px, 200ms, movement only under `motion-safe`). Pi Pocket's 420ms rise is too long for Bica's 200ms limit.
- A prompt joining the queue already uses `appear`, and that is right: it turns up in a list that wasn't there. Leave it.
- The jump-to-latest button (idea 4) fades in, opacity only, 150ms, and leaves at once. It appears on scroll, so it must not move. The scroll it triggers is instant.
- Opening a folded activity (idea 3) uses `expand` and the turning chevron, which tool rows already have. No new motion.
- Streaming text gets no fade or per-word reveal. It is what you read, and it arrives hundreds of times per run. The shimmer on live labels already carries "working".
- The working line (idea 2) gets no entrance. It appears in the gap after a send, right where the prompt just rose in, and two moving things in one spot is noise. Its shimmer is the state signal and stays on under reduced motion, as `docs/UI.md` says progress signals do.
- Stop gets no motion. It is an urgent action, often from the keyboard (Esc twice), and its spinner already shows the wait. The prompts it gives back land in the box at once.
- The run finishing gets no flash. Pi Pocket flashes each finished call green for 0.9s, which in a 30-call run is constant blinking. The chime and the spinner-to-icon `swap-in` already mark the end.
- Morphing the stop and send buttons into one (ChatGPT, Claude.ai) is possible with `swap-in`, but Bica needs both while busy, since you can queue during a run. Today the stop button appears beside send and pushes the voice button left; reserving its slot would stop that shift without any motion.
- Staggering the transcript in on load fails: switching sessions is 100+ times a day.

## Sources

- Pi Pocket: [repository](https://github.com/TannerMidd/pi-pocket), [releases](https://github.com/TannerMidd/pi-pocket/releases) (0.11, 0.12, 0.12.1, 0.13 read in full), and its source: `web/composer.js`, `web/store.js` (drafts), `web/turns.js` (`summarize`), `web/transcript.js` (`ActivityGroup`), `web/style.css` (`.enter`, `settle`), `web/sheets/shortcuts.js`.
- Claude Code: [interactive mode and shortcuts](https://code.claude.com/docs/en/interactive-mode), [status line](https://code.claude.com/docs/en/statusline).
- Codex: [TUI composer](https://github.com/openai/codex/blob/9a8730f3/docs/tui-chat-composer.md), [status indicator](https://github.com/openai/codex/blob/d807d44a/codex-rs/tui/src/status_indicator_widget.rs), [ChatGPT and Codex app commands](https://learn.chatgpt.com/docs/reference/commands), [scroll-to-bottom issue](https://github.com/openai/codex/issues/33768), [Codex CLI shortcut list](https://comboshelf.com/codex-cli).
- Cursor: [agent queue and steering](https://cursor.com/docs/agent/overview), [keyboard shortcuts](https://cursor.com/docs/reference/keyboard-shortcuts), [forum on queue vs steer defaults](https://forum.cursor.com/t/add-message-to-queue-to-enforce-sequential-work-of-agent/171581).
- ChatGPT and Claude.ai shortcuts: [ChatGPT](https://cheatref.com/chatgpt/keyboard-shortcuts), [Claude.ai](https://shortcut-tools.com/en/shortcuts/claude/).
- shadcn/ui [message scroller](https://ui.shadcn.com/docs/components/base/message-scroller), on following, the jump button, and animating a sent message.
- Emil Kowalski: [find-animation-opportunities](https://github.com/emilkowalski/skills/blob/main/skills/find-animation-opportunities/SKILL.md), [emil-design-eng](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md), [You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations).
- The Pi coding agent isn't installed in `node_modules/@earendil-works/` (only `pi-ai`, `pi-durable`, `pi-codemode`, `chord`), so it wasn't read.
