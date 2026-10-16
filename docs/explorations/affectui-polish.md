# affectUI polish

An overnight run that brings [affectUI](https://www.affectui.com)'s motion and finish to Bica: digits that roll, pills that glide, toasts that stack, loaders that settle. Bica keeps its own colors, radii, type and fonts; affectUI gives the feel. Five waves built it, a sixth reviewed and fixed it. Everything is on the `affect-polish` branch; nothing is pushed.

## Look at these first

The worktree's dev server runs on port 3150 with no real data, so every link carries test data. Settings → Appearance → Motion set to Full shows the movement on a Mac with reduced motion on.

1. Home, `http://localhost:3150/?data=demo`. Wait 6 to 12 seconds: the sidebar moves on its own (a session turns running with a green clock, "Write release notes" arrives and the rows glide down, it asks, finishes). Under the composer, the "needs you" stack; press × on it. Point at the Needs you and Running tabs above the list.
2. Press ⌘K, type `res`, press Tab, then Enter. Then the Bica button at the top of the sidebar.
3. A live run, `http://localhost:3150/s/fixture-1?data=demo`. It loops every 30s: the Working header with its timer in tenths, tool rows with their own timers and drawn checks, a streaming reply, the queue on a tray above the composer. Open a finished tool row.
4. A question, `http://localhost:3150/s/fixture-4?data=demo`. Press 1, then 1 again on the second question, then ⌘↵: the card folds into one answered row.
5. Context and cost, `http://localhost:3150/s/fixture-2?data=demo`: the 276k chip, then Context and cost. Point at the rows, press Clean up, then Compact. Then the model chip under the composer and point at the models.
6. The workspace card, `http://localhost:3150/p/vaibica?w=%2FUsers%2Faleksandra%2FRepos%2Fvaibica&data=demo`. Point at the rows and the ring. In the Git tab press Write, then Commit 2 files, and watch the toast and the button. Open `src/App.css` from the card, hover a line number on the right, press +, type, ⌘↵, then Send in the bar at the bottom.
7. Worst case, `http://localhost:3150/p/nw?w=%2FUsers%2Faleksandra%2FRepos%2Fnorthwind-industries-customer-onboarding-platform&data=worst`: press Filter, tick Modified.
8. Settings, `http://localhost:3150/settings?data=demo`: the trays and switches, then scroll to Usage and press Today.

Screenshots from the review, in `/tmp/affectui/w6/` (they go when the machine restarts):

- `home-demo-light.png`, `s1-demo-light.png`, `s4-demo-light.png`, `ptau-demo-light.png`: home, a live run, a question, the workspace card.
- `context-dialog-dark.png`, `model-picker-dark.png`, `cmdk-typed-dark.png`, `settings-usage-light.png`: the context field, the model bars, ⌘K, usage meters.
- `sheet-commit.png` (Write, committing, committed), `comment-saved.png` (a line comment), `sheet-checks.png` (question and filter checkboxes), `pnw-worst-dark.png` (48 files, huge counts).
- `sheet-phone-demo1.png`, `sheet-phone-demo2.png`, `sheet-phone-worst1.png`, `sheet-phone-3.png`: the same screens at 390px, demo, worst, huge and empty.

## Every change, to keep or drop

Waves 1 to 5 each landed as one commit, so dropping one line means reverting that part of its commit by hand; wave 6's fixes are small commits of their own. The detail of each line is in the wave sections below.

Shared pieces (`src/components/ui/`, `src/App.css`)

- `RollingNumber`: digits that roll when a number changes, used for every count and total. bebf534
- `Segmented` with a raised thumb that glides and stretches, plus `SegmentCount` and `SegmentBadge`. bebf534
- `Button loading`: a sweep of light over the label instead of a disabled label swap. bebf534
- Toasts rebuilt: a stack at the top that fans out on hover, swipes away, and `toast.promise` with a spinner that turns into a drawn check. bebf534, eab7939
- `ThinkingLoader`: turning rays and a shimmering label that settles into a check or an icon. bebf534
- `CopyButton` (icon turns into a drawn check), `Kbd`, `DrawnCheckIcon`, `createStopwatch` and `formatLive`. c919689
- `Card`, `Setting`, `Toggle`, `Switch`, `Field` with key and URL checks, `Breakdown`, `Sparkline`. 32af19a
- `createHighlight` (hover fill that glides in menus) and `createFlip` (rows that glide to a new order). 759095f
- `ProgressRing`, `Trend`, `FilterMenu` with chips, `createDropZone`. da67d70
- `Tag` for every tinted status label, `CheckMark` for every checkbox and radio, `-ink` color shades for small colored text. 8e2e83a, 1f94f23, 89aff69

Transcript and composer

- Test transcripts in `demo` and `worst`: a live run on a loop, a question, a finished run with every row kind. c919689
- Activity header: "Working" with a live timer, then "Worked for 18s · 6 tools"; long finished groups load folded. c919689
- Tool rows: spinner and timer on the right, a drawn check when you watch one finish, labelled sections with copy buttons, highlighted JSON, "Show all" instead of inner scrollers. c919689
- Thinking rows: rays while thinking, "Thought for 4s" after. bebf534, c919689
- Questions as a card on a tray, number keys and ⌘↵, folding into one answered row. c919689
- Copy under answers and prompts with a drawn check instead of a toast; copy on code blocks. c919689
- A Working pill before the first token, and "Retrying in 4s" on provider errors. c919689
- Streaming paragraphs fade in. c919689
- Composer: queued prompts and the context nag on a tray behind the card, a focus ring, the send button waking up with text and turning into a queue icon. c919689
- Dropping images on the composer shows a drop target with fanning documents. da67d70

Context, usage, models, settings

- The context window as a field of 240 cells, with Compact and Clean up playing out in place. 32af19a
- Spend by model as a ranked `Breakdown` with a Cost / Tokens switch. 32af19a
- Settings → Usage: a card per plan with meters, API spend by provider with Today / This month and a sparkline per day (new `spend.daily` from the server). 32af19a
- Sidebar usage foot: rolling numbers and a warning dot near the limit. 32af19a
- Model picker: context and price bars per model, price and window in the tray, a Thinking switch with the effort under it (the catalog now carries `cost` and `images`). 32af19a
- Settings sections as trays holding cards, switches instead of checkboxes, a proxy form with a save bar. 32af19a
- Fix: the context chip never turned red. 32af19a

App shell and navigation

- Session rows: a live green clock while running (new `runningSince` from the server), tags for Waiting, Failed and Retrying, a pop when a status changes, a breathing ring while waiting. 759095f
- Sidebar rows glide when the order changes. 759095f
- All · Needs you · Running tabs with rolling counts. 759095f
- The Bica menu, search and collapse in the sidebar header. 759095f
- ⌘K command menu: sessions, projects, terminals and actions, with shortcuts listed. 759095f
- Context menus grow from the pointer and their hover fill glides. 759095f
- Home: the "needs you" stack and the Get started tips. 759095f
- Empty and failed states with an icon, a title and an action; the terminal page's status as a tag. 759095f

Git, files and review

- Git test data that plays out: stage, commit, push, pull, Write. da67d70
- The workspace card on the project page: ring per file, PR state, what changed with diffstats, recent commits. da67d70, ebce090
- Filter on the card, with chips. da67d70
- Commit flow: loading buttons, a drawn "Committed", the draft fading in with Rewrite and Undo, promise toasts for commit, push, pull and land. da67d70
- Rolling line totals on Staged and Changes. da67d70
- Line comments on diffs, sent to the agent as one prompt (prototype, in memory only). da67d70, b3207d1
- `PullRequestBadge` pill. da67d70

Wave 6 fixes (keep these whatever else goes)

- Live timers restarted their interval on every streamed frame and showed 0.0s while the agent thought. deda854
- Line comments warned on every save (`STRICT_READ_UNTRACKED`). b3207d1
- The spend breakdown made the whole page scroll by 700px on Settings. 1e4b9b2
- Tags, the running clock, warnings and segment labels failed AA contrast in light mode. 89aff69, f05179d
- Motion past 300ms shortened; ⌘K opens without the pop on desktop; the model bars fill at once from the keyboard. 7595c0e, 8565762
- Duplicates merged: Breakdown's own FLIP, four tag styles, two checkboxes, two clock formats. dfb580c, 8e2e83a, 1f94f23, deda854
- Workspace card rows 32px on desktop instead of 44; two small tap targets grown on touch. ebce090, 5a33816

## Risks and unfinished

- `runningSince` is the newest turn's first message, so a queued prompt that starts a new turn restarts the sidebar clock.
- Test-data `session.submit` now resolves for every session, so sends to sessions without a transcript look sent; it only affects `?data=`.
- The NeedsYou dismiss and the toast's leave still animate out, against "entrances only"; both are the point of their affectUI originals.
- The running green (`#16a34a`) as text still fails AA in light mode where the old code uses it (the `#42` PR badge, Pierre's file tree counts); only the new uses moved to `running-ink`.
- Pierre's gutter + keeps its blue.
- The streaming test transcript rebuilds the whole view each 60ms, so Solid diagnostics on it show reruns that the real server's patches don't cause.

## Primitives (wave 1)

Later waves reuse these instead of building their own. All live in `src/components/ui/`, and their motion utilities in `src/App.css` (documented in `docs/UI.md`, Motion).

- `RollingNumber` (`RollingNumber.tsx`): `value: number`, `format?: (n) => string`, `class?`. Changed digits roll in (up from below, down from above), the box glides to its new width, tabular figures. Nothing moves on first paint; instant under reduced motion.
- `Segmented`, `segmentClass`, `SegmentCount`, `SegmentBadge` (`Segmented.tsx`): same children API as before (buttons or links with `segmentClass`, the picked one carries `data-on`), now with a raised thumb that glides and stretches toward the target, and sinks while pressed. `SegmentCount` takes `value: number` and rolls; `SegmentBadge` takes children, tinted with the accent.
- `Button` (`Button.tsx`): variants and sizes unchanged; new `loading?: boolean` dims the content under a sweeping light (`shine`), sets `aria-busy`, swallows clicks, and turns off the press. Press now springs back in 150ms with `ease-out`.
- `toast` and `Toaster` (`Toast.tsx`): `toast(message, options?)` as before, plus `toast.success`, `.error`, `.info`, `.loading`, `.promise(promise, { loading, success, error })` and `.dismiss(id?)`. A message is a string or `{ title, description }`; options are `{ id?, description?, action?: { label, onClick }, duration? }`. Up to three stack at the top; the same message twice refreshes the front one.
- `ThinkingLoader` (`ThinkingLoader.tsx`): `label?`, or `phases?: string[]` with `interval?`; `done?`, `doneLabel?: string | (seconds) => string`, `doneIcon?`, `variant?: 'pill' | 'plain'`, `fit?` (off when the label has a fixed width), `class?`, `labelClass?`. Eight turning rays and a shimmering label; a new label rolls in, the pill glides to its width; when done, the rays give way to a drawn check or `doneIcon`.
- Utilities: `roll-in`, `roll-out`, `morph`, `glide`, `shine`, `draw`; tokens `shadow-thumb`, `bg-thumb`, `ease-spring`, `animate-ray`.
- Added in wave 2: `CopyButton` (`text: () => string`, `title?`, `size?`, `class?`; the icon turns into a drawn check, no toast), `Kbd` (a key hint, hidden on touch), `DrawnCheckIcon`, `createStopwatch(on)` and `formatLive(ms)` in `lib/time.ts` for timers with tenths, the `rounded-tray` radius (20px, a tray around a sheet-round card with `p-1`), the `stream-in` utility, and `copyText(text, { quiet: true })` returning whether it worked.

- Added in wave 3: `Breakdown` (`title`, `items: { id, label, value }[]`, `format`, `totalLabel`, optional `options`/`option`/`onOption` switch, `footer`, `children` under the rows), `Sparkline` (`values`, `format`, `month`), `Switch` (`checked`, `onChange`, `label?`), `Field` (`label`, `value`, `onInput`, `check?`, `touched?`, `prefix?`, `type?`) with `checkUrl` and `checkKey(provider, name)`, and `Card` / `Setting` / `Toggle` in `ui/Card.tsx` (a grey `rounded-tray` holding a `rounded-sheet` card of rows, with `bare` for content laid straight on the tray). Utilities `cell` (sweeping fill, `data-busy` wave), `fold` (grid-rows unfold), `animate-grow`, and the `rounded-cell` (2px) radius.

- Added in wave 5: `ProgressRing` (`total`, `done`, `value?`, `hot?`, `onHot?`, `label`), `Trend` (`tone: 'good' | 'bad' | 'neutral'`, `down?`, children), `FilterMenu` and `FilterChips` (`groups`, `value: Record<group, ids[]>`, `onChange`) with `passes(value, facets)`, `createDropZone({ accept, noun, onFiles })` returning `{ handlers, Overlay }`, the `rise-in` utility (`--i` per row) and `animate-chip-in`. Git test data in `src/lib/fixtures/git.ts`.

- Added in wave 4: `createHighlight()` (`ui/Highlight.tsx`: returns `{ Pill, move }`; put `<Pill />` first in a positioned list and call `move(row, glide?)` on pointer enter, `move()` to hide), `createFlip(root, track)` (`ui/flip.ts`: elements with `data-flip` keys glide to new places and fade in when new, each time `track()` changes), `Empty` with `icon`, `title`, `action`, `danger`, the `keys` field on context menu items, `StatusTag` and `statusLabel` next to `StatusDot`, `openCommandMenu()`, and the `animate-breathe` token.

- Added in wave 6: `Tag` and `tagClass` (`tone: 'accent' | 'running' | 'warn' | 'danger' | 'merged' | 'neutral'`), `CheckMark` (`on`, `radio?`), `formatClock` in `lib/time.ts`, and the `-ink` color shades.

## Wave 1: foundations

- Rolling numbers: new `RollingNumber`, after the counts in affectUI's [Reaction Bar](https://www.affectui.com/components/reaction-bar) (digits keyed by place, so only changed ones move; the width glides). Not used on a screen yet; wave 2 and later can put it on context, cost and diff counts.
- Segmented control: `ui/Segmented.tsx` turned into a tray with a gliding thumb, after affectUI's [Segmented Control](https://www.affectui.com/components/segmented-control) (left and right edges glide with different durations, so it stretches). Every existing control (Settings, file view, model effort, voice) gets it with no call-site change. Counts and badges are new. Dropped: dragging the thumb across options, and the label turning semibold, both more than Bica needs.
- Button: `loading` with the light sweep from affectUI's [Button](https://www.affectui.com/components/button). Theirs copies the label into `::after`, which needs plain-text children; a mask works on any content, icons included. Dropped: the width morph when the label changes.
- Toasts: `ui/Toast.tsx` rebuilt after affectUI's [Toaster](https://www.affectui.com/components/toaster) (Pro; read from the live demo: 10px peek, 5% shrink per toast behind, 440ms lifts). Stacks at the top (Bica's toast always came from there), fans out on hover, focus or tap, pauses its timers while open or while the tab is hidden, swipes away sideways or up with a spring back, Esc closes the focused one. Promise toasts turn the spinning arc into a ring while a check or cross draws in, and the text rolls in again. Call sites are unchanged; plain `toast()` now shows a 356px card rather than a pill. Dropped: the countdown hairline and the F8 hotkey.
- Thinking: new `ThinkingLoader`, after affectUI's [Thinking Loader](https://www.affectui.com/components/thinking-loader). Wired into the transcript's thinking row (`Activity.tsx`, plain variant): while thinking, the rays replace the bulb and "Thinking" shimmers; when it ends, "Thought" rolls in and the bulb blurs back in. A thought that had already ended when the page loaded looks as before. There is no "working" indicator before the first token, so none was added; that belongs to the transcript wave.

## Wave 2: the transcript

Look first: `?data=demo`, the "Fix sidebar" session (a run that loops every 30s), then "New post" (press 1, 1, ⌘↵), then "Add project picker".

- Test transcripts: `src/lib/fixtures/conversations.ts` gives `demo` and `worst` three sessions with transcripts: a live run on a loop (thinking, a parallel round with live timers, a streaming reply, a queue), an open question, and a finished one with every row kind (diffs, a failed call, codemode, an error reply). Prompts sent to them land and get a reply, so the question morph and the working pill can be seen. Tool rows open with their full arguments from the fixture.
- Activity header: past one step, the activity card gets a header (`Activity.tsx`), after the group in affectUI's [Tool Call Card](https://www.affectui.com/components/tool-call-card) and the timer of [Thinking State](https://www.affectui.com/components/thinking-state). Wave 1's `ThinkingLoader` runs it: rays and a shimmering "Working" with a live timer in tenths, rolling over to "Worked for 18s" when the run moves on; counts of tools and thoughts, "1 failed" in red, and the newest tool kinds stacked as small tiles. Finished groups of four or more steps load folded. Time adds each round's slowest call, since a round runs in parallel.
- Tool rows (`ToolCalls.tsx`), after Tool Call Card: the spinner moved from the icon to the right, with a live timer; a call you watch finish draws a check for a moment, then shows its time if slow; errors say "Failed". Opened, a call shows labelled sections (command, arguments, output, error) each with a copy button, JSON highlighted with their token regex, and long blocks capped at a fade with "Show all · N lines" instead of a scroller inside the page. Thought rows show how long they took.
- Questions (`AskCard.tsx`), after [Approval Card](https://www.affectui.com/components/approval-card) (Pro; layout and CSS read from the live demo) and [Decision Inbox](https://www.affectui.com/components/decision-inbox): a white card on a grey tray (new `rounded-tray` token, 20px), header chips, radio dots and checkboxes whose check draws in, number keys shown per option for the current question, ⌘↵ on the Send button, `Button loading` while sending. Once answered, the tray glides from its height down to one resolved row with a check that pops and draws; the row opens to the questions. Their pending card fades and blurs out; here it goes at once, since closing is instant in Bica.
- Message actions, after [Message Actions](https://www.affectui.com/components/message-actions): new `ui/CopyButton.tsx`, whose icon blurs into a drawn check for 1.4s instead of a toast. Used under answers (with fork), next to your prompts' time, on errors, on tool sections, and on code blocks in replies (hover). The bar fades in on hover instead of snapping.
- Working pill: before the first token, a `ThinkingLoader` pill with a timer since your prompt sits at the bottom of the transcript ([Thinking State](https://www.affectui.com/components/thinking-state)). A provider error waiting to retry shows there as "Retrying in 4s · reason".
- Composer, after [Chat Composer](https://www.affectui.com/components/chat-composer) (Pro, CSS read from the demo): queued prompts and the context nag sit on a tray behind the card (it reaches 4px past the card, so the card doesn't move); a soft accent ring on focus; the send button rests faded and smaller while empty and wakes up when there's text; while the agent works it turns into a queue icon. Image thumbnails settle in. Every shortcut and paste path is unchanged.
- Queue lines (`Queue.tsx`): lines on the tray with a queue or push icon, not cards.
- Streaming: new paragraphs of a reply fade and unblur in (`stream-in` in `App.css`); the last block re-rendering as it grows doesn't, so nothing flickers.
- Diffs inside tool calls get a hairline frame.
- Dropped: Retry on a failed tool call (Bica can't rerun one call) and on a failed turn (Pi Durable retries itself; the pill shows it). Auto-opening failed calls (agents fail tests all the time; it would be noisy). Thumbs, regenerate and read aloud from Message Actions (Bica has none of them). The countdown and "Always allow" of Approval Card (Bica's questions don't expire). The pending card's fade-out. A timeline line between steps from Thinking State (busier than Bica's rows).
- Known: a `REACTIVE_WRITE_IN_OWNED_SCOPE` warning shows once on every page load, also on pages without anything from this wave (settings, `?data=live` home); not traced.

## Wave 3: context, spend, usage, models

Look first: `?data=demo`, the "Add project picker" session → context chip → Context and cost. Point at the rows, then press Clean up, then Compact. Then Settings (scroll to Usage, press Today), then the model chip under the composer.

- Context field (`ContextField.tsx`, in the context dialog), after [Context Window](https://www.affectui.com/components/context-window) (Pro; CSS and markup read from the live demo): 240 cells (40 a row, 24 on the phone) filled by system prompt, tools, conversation and tool output, with the answer reserve outlined at the end. Pointing at a row, a sub-part or a cell lights its cells (others fade to 20%, lit ones grow 15%) and rolls the big number to it. Tool output is split from the conversation because it is what Clean up clears: the Compact button sits on the conversation row, Clean up on the tool output row, and pointing at Clean up lights exactly the cells it would free. While either runs, the cells breathe in a wave (`cell` with `data-busy`, their 900ms wave with 15ms per cell), then the fill sweeps clear cell by cell (2ms per cell) and the button turns into a drawn check: "Compacted", "Cleaned". The tray line under the card says what's left before auto-compaction (yellow below 20%, red past it) and then "Compacted: 119k tokens freed" in green. Replaces the old bar and group list.
- Spend by model (`ui/Breakdown.tsx`, in the same dialog), after [Compact Breakdown](https://www.affectui.com/components/compact-breakdown) (Pro, read from the demo): rolling total, a gliding bar, ranked rows that slide to their new rank (FLIP with WAAPI, 360ms). Bica has no per-period data per session, so the switch is Cost / Tokens instead of a period, which still reorders the rows for real (Opus costs most, Codex reads most). The read/write/new/out table stays, folded under "Tokens by kind".
- Usage (`PlanUsage.tsx`, Settings → Usage), after [Usage Meter](https://www.affectui.com/components/usage-meter) (Pro, read from the demo): a card per plan with the tightest window as the big rolling percentage and bar, every window as a thin meter with its reset time, a dot that pops in at 80% (yellow) or at the cap (red), and a polite line under the card ("14% of the week left", "Session limit reached, back 04:15"). API keys get a `Breakdown` by provider with a real Today / This month switch, and a `Sparkline` of this month per day underneath (new: the server now sends `spend.daily`, from the per-day file it already kept). Dropped: the stacked bar by category for plans (plan windows overlap, they don't add up) and the upgrade button.
- Sidebar foot (`PlanUsage.tsx`): percentages and spend roll, the bar glides, and the same warning dot shows near the limit.
- Model picker (`ModelPicker.tsx`), after [Model Picker](https://www.affectui.com/components/model-picker) (Pro, read from the demo): a tray around the menu card, two five-step bars per model (context window and list price, from pi-ai; the catalog now carries `cost` and `images`), a line under each name ("200k context · images"). Pointing at a model fills its bars segment by segment (70ms per column, 45ms per segment), steps the other rows back, and rolls the tray to its price per million and window. A Thinking switch for models that can stop thinking, with the effort folding open under it; picking a model keeps the nearest effort it has. Dropped: speed and quality bars and first-token time (pi-ai has no such numbers), web search toggle, key hints.
- Settings (`routes/settings.tsx`, `Accounts.tsx`, `ProxySettings.tsx`), after [Integration Settings](https://www.affectui.com/components/integration-settings) and [Settings & Billing](https://www.affectui.com/screens/settings-billing) (both Pro, read from the demos): every section is a grey tray with its title holding a white card of rows (`ui/Card.tsx`); checkboxes became `Switch` rows; providers get a letter tile, a model count badge and their source on one line. The API key field when adding a key (`ui/Field.tsx`) draws a check once it looks like a key, says when it has spaces or is too short, and notes when it doesn't start like that provider's keys (`sk-ant-`, `sk-`, `sk-or-`) without blocking. The proxy form checks its address (red ring and reason after you leave the field) and ends in a save bar: "Unsaved changes · Discard · Save", with `Button loading`. Behavior is the same: settings still save on change, the proxy form on Save.
- Loading buttons: Voice settings' Save, the dialog's Compact, and the nag's Compact and Clean up use `Button loading` instead of a disabled label swap. The nag's token count rolls.
- Fixed: the context chip never turned red. The ghost button's `text-muted` sorts after `text-danger` in the CSS, so danger lost (yellow worked because `text-warn` sorts later); it now uses `text-danger!`.
- Test data (`src/lib/fixtures/usage.ts`): in `demo` and `worst`, the models (with list prices), providers, plan usage (a week at 86%, a capped session in `worst`, a month of API spend where OpenAI wins today and OpenRouter the month) and a context per test session (a 1M-window session past 270k with lots of tool output, a 200k one near the limit, a small one). Compact and Clean up on test sessions play out (cells breathe, then shrink) instead of being held back; `refused()` can now return a promise for that.
- `REACTIVE_WRITE_IN_OWNED_SCOPE`: not reproduced. With a console hook that prints the stack of every Solid warning, fresh loads of `/settings`, `/?data=live`, `/?data=demo` and session pages on this branch printed none, and neither did `main`'s `/settings` on port 3142. It may have gone with a later wave-2 commit, or only show on the dev server's very first load. Two `STRICT_READ_UNTRACKED` warnings this wave introduced were fixed.
- Browser note: if `agent-browser screenshot` hangs (even on `about:blank`), relaunch with `agent-browser close --all` and `--args "--disable-gpu"`; the headless GPU stopped producing frames here overnight. For the phone, a 390px iframe of the same origin works where `set viewport` wedged.

## Wave 4: app shell and navigation

Look first: `?data=demo` home, and wait 6 to 12 seconds: the list moves on its own (a session turns running, "Write release notes" appears at the top and the rows below glide down, it asks, finishes, and goes). Then ⌘K, type "res", press Tab and Enter. Then the Bica button at the top of the sidebar, and the Needs you tab. Set Settings → Motion to Full to see the movement on a Mac with reduced motion.

- Session rows (`Sidebar.tsx`, `StatusDot.tsx`), after [Agent Inbox](https://www.affectui.com/components/agent-inbox) (Pro; CSS read from the live demo): the age on the right gives way to a live clock while a session runs (green, ticking per second, since the prompt that started the run; new `runningSince` on `SessionSummary`, set by the server) and to calm tinted tags for Waiting, Failed and Retrying. A status you watch change pops its new dot shape in (`swap-in`); the tag crossfades. Going idle doesn't pop, since opening an unread session does that. The waiting ring breathes (`animate-breathe`, their 2s pulse). Rows stay 28px; the context menu, ⋯ on touch, ⌘/shift multi-select and rename are untouched. There was no drag or row keyboard navigation to keep.
- Rows that glide (`ui/flip.ts`): when the order changes (a new session, one archived, a workspace back from Parked, a filter picked), rows slide from where they were (380ms) and new ones fade in, as Agent Inbox does with FLIP. It tracks a string of row keys, not every snapshot, so streaming costs nothing; switching sessions moves nothing.
- Filter tabs (`Sidebar.tsx`): All · Needs you · Running on wave 1's `Segmented`, with rolling `SegmentCount`s. Needs you holds waiting, failed and unread; terminals, files, Parked and Archived hide under a filter; the open session stays listed so it doesn't vanish once marked read. Pointing at a tab fades the rows it would leave out, as in the inbox. All has no count: it didn't fit 256px and says little. Not kept across reloads (would need a hydration-safe read).
- Sidebar header, after [App Shell](https://www.affectui.com/screens/app-shell) (Pro, read from the demo) and [Profile Menu](https://www.affectui.com/components/profile-menu): the Bica name is now a menu button (new session, search ⌘K, add project, settings, theme), with search and a collapse button (⌘B) on the right, where the folder and settings icons were. Dropped: the account footer (Bica has no accounts; wave 3's usage foot stays there) and per-project collapse.
- Command menu (new `CommandMenu.tsx`, ⌘K), after [Command Menu](https://www.affectui.com/components/command-menu) (Pro; CSS and markup read from the demo): a tray around a card, a field with "↵ to open", groups (Needs you and Recent sessions when empty; Sessions, Actions, Projects, Terminals when typing), every typed word must match, matches lit, shortcuts shown as `Kbd`, a footer of key hints. The highlight glides under the pointer; arrows, Tab (next section) and Enter stay instant, per Bica's rule for keyboard motion. Esc clears, then closes. A bottom sheet on the phone (`max-md:sheet md:pop`). Bica had no shortcut help, so the menu doubles as one. Files are left out: there is no cheap file index on the client.
- Context menu (`ui/ContextMenu.tsx`): it now grows from the exact pointer position (`transform-origin` in px), the hover fill glides between items (`createHighlight`, also in the project picker), and items can show a shortcut (`keys`).
- Home "needs you" stack (new `NeedsYou.tsx`), after [Notification Stack](https://www.affectui.com/components/notification-stack) and [Decision Inbox](https://www.affectui.com/components/decision-inbox): under the composer, the most urgent session reads in front (waiting, then failed, then unread) with its tag, place, time and "+N more" rolling; two cards peek out behind (10px, 5% smaller each). × slides it away and the next moves up; on an unread one it also marks it read.
- Home tips (new `HomeTips.tsx`), after [Tips Panel](https://www.affectui.com/components/tips-panel) and [Assistant Home](https://www.affectui.com/screens/assistant-home): with no sessions in progress, a "Get started" tray with three tips (add a project, ⌘K, start with a voice call), each with one action, a drawn check when done, closed for good with ×. Kept the heading "What are we building?" rather than a time-of-day greeting.
- Empty states (`ui/Empty.tsx`, `ui/Failed.tsx`): optional icon tile, title and action. Failed now says "Something went wrong" with the reason and a Reload button; Terminal closed got an icon and a line on what to do.
- Terminal page (`routes/t/[id].tsx`): its status is a tag like the sidebar's (green Running, red on a failing exit).
- Test data: `?data=demo` runs a six-step story every 6s on the session list (`fixtures/index.ts`), so tags, clocks, pops and glides can be seen; fixtures carry `runningSince`.
- Not changed: `TopBar`, `LanePicker`, `TitleInput`, `CallBar` (nothing from affectUI fit without new data; a call timer would need a start time). Illustrations: none fit the calm look.

## Wave 5: git, files and review

Look first: `?data=demo`, open the vaibica project's main folder (sidebar → vaibica → main), and point at the rows and the ring. Then press Write and Commit in the Git tab and watch the toast, the button and the card. Open `src/App.css` from the card, hover a line number on the right, press +, write a comment, ⌘↵, then Send in the bar at the bottom. Then `?data=worst` on northwind's main folder and press Filter.

- Test data (`src/lib/fixtures/git.ts`): Git status for the demo's vaibica folders and blog, and for worst's northwind (48 files, counts in the tens of thousands, a conflict, a binary, a rename, a submodule) and the CJK project; GitButler lanes for `shop`; session changes for folders without git; diffs and file reads of every test change, generated to look like their kind. Status lives in a signal, so stage, unstage, discard, commit (all or staged), push, pull, Write and the lane commit play out with delays: files move, commits land, counts roll. Test-data submits now answer, so whatever waits on a send moves on.
- Workspace card (new `WorkspaceOverview.tsx` on the project page, where "Pick a file or a change on the right" was), after [Project Card](https://www.affectui.com/components/project-card) (Pro; ring markup and CSS read from the demo: 12.5 radius, round caps, done segments filled in ink) and [Change Summary](https://www.affectui.com/components/change-summary): a tray around a card with a ring of one segment per changed file (filled once staged; 24 thin square-ended ones past 12 files), the name, a PR status tag (`Open #42` green, Draft grey, Merged in `merged` purple, Closed red, after their tone tags), the branch and ahead/behind. Under it "What's changed" with rolling `+/−` totals, and a row per file: kind letter, folder in grey and the name kept visible, `Trend` chips for lines added and removed, and a five-cell diffstat. Rows rise in one after another (120ms + 70ms each, their timing). Pointing at a row lifts its segment and dims the rest; pointing at a segment lights its row, which is their hover linking. The tray line says what's staged, to push and to pull, with "Open #42 ↗". Recent commits sit under it. Works for git, GitButler (lanes as "where") and folders without git (the newest session's changes).
- Filter (new `ui/FilterMenu.tsx`), after [Filter Menu](https://www.affectui.com/components/filter-menu): on the card, a Filter button opens grouped checkboxes (Change, Folder, Where; groups with one option are left out) with counts, folding groups, checks that draw in, arrows/Home/End/←/→, Clear all; picks show as removable chips on the card too, and the totals roll to the filtered set. A sheet on the phone. Dropped: the keyboard hint footer (Bica shows hints elsewhere) and the chips' smooth height.
- Commit flow (`CommitBox.tsx`), after [Button](https://www.affectui.com/components/button), [Toaster](https://www.affectui.com/components/toaster) and [Email Draft](https://www.affectui.com/components/email-draft): Write and Commit use `Button loading` (the spinner swaps are gone); a commit that went through turns the button into a drawn check and "Committed" in green for 1.8s. A draft fades in where the text was (their tone switch), Write becomes an accent "Rewrite", and Undo puts back what was in the box. Commit, amend, push, publish and pull in the Git tab, and commit, push and land on GitButler lanes, run through `toast.promise`: "Committing 2 files…" turns into "Committed: <subject>" with a check, or "Push failed" with the reason. Push and pull counts roll. Errors in ButlerPanel use `toast.error`/`toast.success`. Dropped from Email Draft: recipients, tones (the server has one kind of message) and send-with-undo (git has its own undo).
- Rolling totals in the Git tab: Staged and Changes headers show `+N −M` lines with `RollingNumber`, so staging a file moves the numbers between them.
- Line comments (PROTOTYPE; `lib/review.ts`, `CommentCard.tsx`, `ReviewBar.tsx`), after [Comments Panel](https://www.affectui.com/components/comments-panel) and [Inline Diff](https://www.affectui.com/components/inline-diff) (both Pro, looked at in the demos): Pierre's own gutter + (`enableGutterUtility`) on every diff opens a comment box under the line, or a range when dragged, rendered by Solid into Pierre's annotation slot. ⌘↵ saves, Esc cancels; saved comments show their lines, with edit and delete on hover. A bar at the bottom of the file view counts them (rolling) and sends them as one prompt with each file, lines and the quoted code to the open session, or on the project page the newest session in the workspace, through a promise toast with Open. In memory only, per workspace. Not done: comments on plain file views, keeping them across reloads or file changes (line numbers can drift), resolving, threads, and the accept/reject of Inline Diff (Bica's agent edits files itself).
- Drop target (`ui/DropZone.tsx`, three lines in `Composer.tsx`), after [Dropzone](https://www.affectui.com/components/dropzone) (Pro, docs read): dragging images over the composer shows a dashed accent outline with three little documents fanning out (springing from stacked) and "Drop 2 images to attach"; other files read "Only images can be attached". Drop attaches them through the existing path. Dropped: their upload rows and progress (attaching is local and instant).
- Small: `PullRequestBadge` gets a `pill` look (tinted tag with the state named). New icons: filter, comment, send, upload, commit.
- Not changed: `Inspector` tabs, `FileTree`, `TerminalView`, `SessionChanges`, `BranchName`, `FilePreview` framing. Their Pierre theming already follows the tokens, and nothing in this wave's items fit them without new data. Pierre's own gutter + keeps its blue; theming it needs a CSS variable Pierre doesn't expose.
- Known: on the project page the Send target is the newest session in the workspace, so in `?data=demo` it flips to the story session ("Write release notes") while that one is live.

## Wave 6: review

A strict pass over waves 1 to 5: merge duplicates, cut motion that didn't earn its place, fix what broke, walk every screen.

- Stopwatch (`lib/time.ts`): its switch was a plain function, so a streaming message reran the effect every 60ms and the 100ms interval never fired; the activity timer read 0.0s while thinking. It now waits on a memo and doesn't write when it starts (that was an `EFFECT_RELAY_TEAR` too). The sidebar's clock format moved there as `formatClock`, and `formatLive` uses it past a minute, so long runs read "1h 05m" instead of "65m 00s".
- The activity header's tool stack memo returned a new array on every frame (`UNSTABLE_MEMO_OUTPUT`); it compares by names now.
- `Tag` (`ui/Tag.tsx`): the sidebar, the home stack, the terminal page and the PR pill each had their own tinted label; they share one height and five tones now.
- `CheckMark` (`ui/CheckMark.tsx`): questions and the filter menu drew their own checkboxes, in different sizes and colors; both use the question's accent box with the drawn check.
- `Breakdown` had its own FLIP; it uses `createFlip` now. Its screen-reader total sat against the page, not the card, and made Settings scroll by 700px; the card is `relative` now.
- Motion, after Emil Kowalski's [review-animations](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/SKILL.md): `rise-in` went from 520ms with 70ms per row and no cap (48 rows took 3.4s to arrive) to 300ms, 40ms per row, capped at the eighth; `stream-in` 360 → 240ms; `fold` 320 → 240ms; sparkline bars 420 → 300ms; chips 260 → 200ms from 95% rather than 90%; sidebar and breakdown FLIP 380 and 360 → 300ms; the needs-you stack 420 → 300ms; the answered question's fold 400 → 300ms; usage bars 500 → 300ms. ⌘K is a shortcut, so on desktop it opens without the pop (the phone sheet stays). The model picker's bars filled with up to 250ms of stagger even when moving with the keyboard; the stagger is shorter and focus fills them at once.
- Contrast: new `-ink` shades (`accent-ink`, `running-ink`, `warn-ink`, `danger-ink`, `merged-ink`) for 12px colored text on tints. Light-mode warnings were at 2.6:1 and tags near 4:1; they pass AA now. Segment labels on the grey tray were 3.9:1; they use `fg/65`.
- Line comments: the effect that hands comments to Pierre read them untracked (`STRICT_READ_UNTRACKED` on each save); a memo with an equality check feeds it now.
- Workspace card: rows were 44px on desktop; 32px now, 44px on touch. "What's changed" is no longer accent orange. Clear all in the filter and "Open #42" grow to 44px on touch.
- The toast export is a function with kinds attached, so the linter stops flagging it.
- Checked: `bun run check`, `bun run lint` (the same 8 warnings as `main`), `bun run test:bun`; every screen above in light and dark, at 1440px and 390px, with `demo`, `worst`, `huge` and `empty`; console clean on each, including after ⌘K, the context dialog, the model picker, a commit, a line comment, the filter and the home story. `REACTIVE_WRITE_IN_OWNED_SCOPE` did not show. With `huge`, 200 running clocks cost 0.6ms a second.
- Left alone: the uppercase section labels in the context dialog (from `main`), Pierre's own colors, `text-muted/70` for durations (the existing convention).

## Ideas for later waves

- Turn the remaining error `toast()` calls (Sidebar, workspace) into `toast.error`; ButlerPanel and the git actions are done.
- Line comments: keep them on the server per workspace, re-anchor them when the file changes, and allow them on plain file views.
- `Card` and `Switch` for other settings-like surfaces (Voice settings dialog, the terminal and project dialogs).

## Sources

- [affectUI](https://www.affectui.com) and its docs for agents, [llms-full.txt](https://www.affectui.com/llms-full.txt)
- [Reaction Bar](https://www.affectui.com/components/reaction-bar)
- [Segmented Control](https://www.affectui.com/components/segmented-control)
- [Button](https://www.affectui.com/components/button)
- [Toaster](https://www.affectui.com/components/toaster)
- [Thinking Loader](https://www.affectui.com/components/thinking-loader)
- [Tool Call Card](https://www.affectui.com/components/tool-call-card)
- [Approval Card](https://www.affectui.com/components/approval-card)
- [Decision Inbox](https://www.affectui.com/components/decision-inbox)
- [Message Actions](https://www.affectui.com/components/message-actions)
- [Thinking State](https://www.affectui.com/components/thinking-state)
- [Chat Composer](https://www.affectui.com/components/chat-composer)
- [Context Window](https://www.affectui.com/components/context-window)
- [Compact Breakdown](https://www.affectui.com/components/compact-breakdown)
- [Usage Meter](https://www.affectui.com/components/usage-meter)
- [Model Picker](https://www.affectui.com/components/model-picker)
- [Integration Settings](https://www.affectui.com/components/integration-settings)
- [Settings & Billing](https://www.affectui.com/screens/settings-billing)
- [Agent Inbox](https://www.affectui.com/components/agent-inbox)
- [App Shell](https://www.affectui.com/screens/app-shell)
- [Profile Menu](https://www.affectui.com/components/profile-menu)
- [Command Menu](https://www.affectui.com/components/command-menu)
- [Notification Stack](https://www.affectui.com/components/notification-stack)
- [Tips Panel](https://www.affectui.com/components/tips-panel)
- [Assistant Home](https://www.affectui.com/screens/assistant-home)
- [Change Summary](https://www.affectui.com/components/change-summary)
- [Filter Menu](https://www.affectui.com/components/filter-menu)
- [Email Draft](https://www.affectui.com/components/email-draft)
- [Project Card](https://www.affectui.com/components/project-card)
- [Comments Panel](https://www.affectui.com/components/comments-panel)
- [Inline Diff](https://www.affectui.com/components/inline-diff)
- [Dropzone](https://www.affectui.com/components/dropzone)
- Pierre diffs, [line annotations and the gutter utility](https://diffs.com/docs#vanilla-js-api)
- Emil Kowalski, [emil-design-eng](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md): transitions over keyframes for toasts, press at 97%, pause timers when hidden
- Emil Kowalski, [review-animations](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/SKILL.md): the bar for wave 6's motion audit
