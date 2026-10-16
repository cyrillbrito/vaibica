# Server modules

This is an exploration and a plan. Nothing in it is built, and no code changed. It maps `src/server/` as it is on `91933d5`, finds the groups that should become deep modules, and proposes a layout and a migration in small steps.

## Summary

`src/server/` is 37 flat files and about 9,500 lines. Most files are already fine on their own. The trouble sits in a few places:

- One knot of 11 files imports each other in a cycle: `harness`, `models`, `proxy`, `plan-usage`, `fast-model`, `profiles`, `sessions`, `session-changes`, `coding-tools`, `session-tools`, `terminal-tools`. Seven dynamic `import()` calls in five files exist only to dodge it. The root is `harness.ts`. It owns the model registry that every provider file needs, and it imports every tool at once.
- `sessions.ts` has 1,325 lines and 35 exports, and nine files import it. It mixes six jobs: the session list, creating and forking, the prompt queue, notes between sessions, titles and branch names, and the hub. Thirteen of its exports exist only for a single other file, mostly the agent tools.
- Profiles are a table with no body. `profiles.ts` (43 lines) forwards to `instructions.ts`, while the hub alone is spread over nine files: `harness`, `coding-tools`, `session-tools`, `instructions`, `models`, `sessions`, `long-lived`, `socket`, and the client's `lib/sessions.ts`.
- Three files reach past `sessions.ts` into Pi Durable's raw conversations (`voice.ts`, `commit-message.ts`, `long-lived.ts`), and each one rewrites the same "text of the last messages" code.
- Shared mutable state hides on `globalThis` in 9 files for dev HMR, and one module starts a timer just by being imported (`socket.ts:56` imports `long-lived`).

Four features go first, about 2,700 lines in all: GitButler, Web Push, the direct plan meters, and the hidden git copies for folders without git. See What to remove first. After that, the proposal is six folders, each with an `index.ts` that is its only entry point: `agent/`, `providers/`, `sessions/`, `profiles/`, `git/`, and `terminals/`. `projects.ts`, `voice.ts`, `live.ts`, `socket.ts`, and `ws-log.ts` stay flat. Profiles become the module that knows what kind of session this is: its tools, instructions, model, panels, and upkeep. Sessions stop knowing that the hub exists.

The migration starts with step 0, the removals, then nine steps. Steps 1 to 4 are mechanical moves. Steps 5 to 7 shrink interfaces without changing behavior. Steps 8 and 9 change how the server boots and need the restart-recovery test.

## What exists

### Files by concept

The line counts come from `wc -l`. Fan-in is how many other server files import the file.

| Concept | Files (lines) | Fan-in | Notes |
| --- | --- | --- | --- |
| Agent runtime | `harness` (92) | 9 | Opens Pi Durable, owns `models` (the pi-ai registry), installs every tool, and keeps `context` |
| Sessions | `sessions` (1,325), `projection` (253), `long-lived` (85) | 9, 2, 0 | `SessionDoc`, the list, create, fork, queue, notes, titles, lanes, hub |
| Profiles | `profiles` (43), `instructions` (253), `skills` (98), `lib/profiles` (29) | 1, 2, 2 | The server half is a table plus two forwarders |
| Agent tools | `coding-tools` (115), `session-tools` (304), `terminal-tools` (217), `web-tools` (184), `codemode-tool` (484), `ask-tool` (56), `summary` (25), `tool-time` (50), `fit-image` (25) | 1 to 5 | All are Durable extensions, and all are wired in `harness.ts` |
| Providers and models | `models` (219), `credentials` (70), `accounts` (255), `proxy` (389), `plan-usage` (325), `fast-model` (46), `thinking-time` (53) | 8, 3, 1, 4, 2, 2, 1 | `models.ts` also owns `settings.json` |
| Git and files | `workspace` (750), `butler` (412), `session-changes` (226), `commit-message` (151), `editor` (14) | 5, 4, 2, 1, 1 | Plain git, GitButler lanes, shadow git for folders without git |
| Projects | `projects` (300), `github` (88) | 7, 1 | Projects, worktrees, chats, PRs |
| Terminals | `terminals` (451) | 4 | PTYs; state on `globalThis` |
| Notifications | `notify` (142), `push` (160) | 2, 2 | Presence, run-end pushes; `push` is pure Web Push |
| Voice | `voice` (409) | 1 | GPT-Live calls on a session |
| Transport | `socket` (705), `ws-log` (30), `live` (53) | 1, 1, 8 | One router; `live` is the watch primitive |

### Who imports whom

These are the value imports that matter. Type-only imports from `src/lib/protocol.ts` are left out, because that file is the shared contract and is fine.

- `socket` imports almost everything, which is its job. It names 22 functions from `sessions` and 11 from `workspace`.
- `harness` imports `ask-tool`, `codemode-tool`, `coding-tools`, `credentials`, `models`, `proxy`, `session-tools`, `terminal-tools`, `plan-usage`, `thinking-time`, `tool-time`, and `web-tools`.
- `models`, `proxy`, `accounts`, `fast-model`, and `voice` import `harness` only for `models`, the pi-ai registry.
- `sessions` imports `ask-tool`, `butler`, `fast-model`, `harness`, `instructions`, `models`, `profiles`, `projection`, `live`, `notify`, `projects`, and `terminals`.
- Back into `sessions`: `coding-tools` (dynamic), `session-tools` (dynamic), `terminal-tools` (static and dynamic), `session-changes`, `commit-message`, `long-lived`, `voice`, and `notify` (dynamic).
- From the client side, only `src/lib/fixtures/conversation.ts:11` imports server code (`projection`). The scripts import `fit-image` and `push`.

The static cycle, found with Tarjan's algorithm over value imports, runs through these edges:

```
harness → coding-tools → session-changes → sessions → harness
harness → session-tools → terminal-tools → sessions → harness
harness → models → harness           (models needs harness.models)
harness → proxy → harness, proxy → models
harness → plan-usage → proxy
sessions → profiles → harness, profiles → models
sessions → fast-model → harness, fast-model → models
```

These dynamic imports exist to stay out of it:

- `coding-tools.ts:22`, `session-tools.ts:14`, and `terminal-tools.ts:75` import `sessions`. The comment at `session-tools.ts:12` gives a second reason: the harness outlives dev reloads, so a static import would pin old session code.
- `session-tools.ts:152` and `:228` import `projects` and `terminals`.
- `notify.ts:13` imports `sessions`, because `sessions` imports `notify`.
- `instructions.ts:196` imports `projects`.

### Files that change together

Over the last 60 commits that touched `src/server`, `sessions.ts` and `socket.ts` changed together most often. Next came `harness` with `models` and with `instructions`, and `butler` with `workspace`, `coding-tools`, and `sessions`. The hub commit (`3812429`) touched 10 server files for one feature: `coding-tools`, `harness`, `instructions`, `long-lived`, `models`, `profiles`, `session-tools`, `sessions`, `socket`, and `assistant.ts`, which it renamed. That is the clearest sign that profiles have no home.

## Problems today

1. The registry lives in the wrong file. `harness.ts:33-38` builds `models`, adds the proxy provider, and hooks thinking-time and plan usage. Five files import the harness only for this registry, and that ties every provider file into the cycle. Moving the registry out ends the `harness ↔ models/proxy/plan-usage/fast-model` part of the knot.
2. The harness knows every tool and profile. `harness.ts:10-21` imports all the tools, and `harness.ts:25-29` defines `HUB_EXTENSIONS`. So adding a profile means editing the agent runtime.
3. `sessions.ts` is a god module. Its internals leak out as exports with a single caller:
   - `noteMessage`, `notifyWhenIdle`, `spawnSession`, `readSession`, and `recentMessages` exist only for `session-tools`.
   - `claimEdit` exists only for `coding-tools`.
   - `refreshInstructions`, `retitle`, `voiceSettings`, and `VOICE_TITLE` exist only for `voice`.
   - `runOutcome` exists only for `notify`.
   - `sessionWorkspace` is called by `terminal-tools`, `session-changes`, and `voice`.
   - `retireSessions` is exported but only used inside the file.
   - `createSession` takes 11 positional parameters (`sessions.ts:567-582`), and `spawnSession` passes `undefined` in the middle of them (`:722-734`).
4. Profiles are shallow, and the hub is scattered. `profiles.ts:36-43` is an `if hub / else` that calls `buildInstructions(cwd, lane, profile === 'assistant', memory)`, a boolean flag in place of a profile. The hub lives in nine places:
   - `harness.ts:25` holds its extensions.
   - `coding-tools.ts:84-105` holds `ownFolder` and `HubFileTools`.
   - `session-tools.ts:36` passes a `hub` boolean through every tool description.
   - `instructions.ts:152-233` holds its preamble, rules, `hubProjects`, and builder.
   - `models.ts:108-136` holds `HUB_MODEL`, `hubChoice`, and `hubFolder`.
   - `sessions.ts` has the hub alert at `:314`, the special case in `spawnSession` at `:711`, and `findHub`, `openHub`, and `updateHub` at `:925-998`.
   - `socket.ts:154-161` knows that a settings change must call `updateHub`.
   - The client's `lib/sessions.ts:16` repeats the `findHub` predicate.
   - `openHub` (`sessions.ts:933-975`) copies `createSession`'s `createConversation` call instead of reusing it.
5. Raw harness access goes around `sessions`. `getHarness()` and `harness.conversation(...)` appear in `sessions` (36 times), `voice` (3), `commit-message` (2), and `long-lived` (1). Each of `voice.ts:380-400`, `commit-message.ts:29-60`, and `sessions.ts` (`textOf`, `lastReply`, `recentMessages`) re-reads entries and extracts text in its own way.
6. Shared mutable state lives on `globalThis` for HMR. These sit in `sessions.ts:126-136` (3 maps), `notify.ts:63-70` (3), `butler.ts:133,148`, `credentials.ts:23`, `models.ts:54`, `terminals.ts:55-60`, `harness.ts:88`, and `long-lived.ts:37-44`. The reason is real and documented, but each module invents its own key names, and `runState` in `sessions` is mirrored by `running` in `notify`.
7. Importing a file starts behavior. `socket.ts:56` has `import './long-lived'`, and `long-lived.ts:42-44` starts a one-minute interval at load. `harness.ts:34-38` sets up the proxy at load. Boot order is implicit.
8. Two `inside` functions have opposite contracts. `workspace.ts:37` throws and returns an absolute path. `butler.ts:164` returns a relative path or null, and strips `@`. `coding-tools` imports the GitButler one to fence the hub's folder.
9. `models.ts` owns `settings.json` (`:21`, `:175-213`), but that file also holds a git habit (`stageOnView`) and two hub settings. A provider module shouldn't own the hub's folder.
10. The literal `.data` appears in 9 files, and `ws-log.ts` imports `skills.ts` only for `BICA_HOME`.
11. Two contracts cross into the client without being declared. `lib/context-usage.ts:244` parses the `<project_context>` and `<memory>` tags that `instructions.ts` renders. `lib/fixtures/conversation.ts:11` imports `server/projection`, which works only because `projection` is pure.

Several files are already deep and should stay as they are:

- `live.ts`: 53 lines, two functions, and it is the backbone of every topic.
- `terminals.ts`: one owner of PTY state.
- `projection.ts`: pure.
- `codemode-tool.ts`: 484 lines with one local import.
- `push.ts`: pure Web Push.
- `projects.ts`.
- `workspace.ts`, apart from its exports for `butler`.

## Candidate modules

Each module gets one `index.ts`. Callers outside the folder import only that file. The lists below name what goes out, what stays in, and who calls it today.

### `agent/`: the Pi Durable runtime

- Files: `harness.ts`.
- Exports: `getHarness()`, `context`, and `conversation(id)`, a small helper that throws on a missing session and replaces the repeated `getConversation`. It also exports `installExtensions(defaults, extra)`, called once at boot.
- Internal: the registry, the storage path, `open()`, and the settings getter.
- Must stop: owning `models` (it moves to `providers/`), importing tools, and defining `HUB_EXTENSIONS`.
- Callers: `sessions/` and `voice.ts`. Later, only `sessions/`, `voice.ts`, and `profiles/long-lived.ts`.

### `providers/`: models, keys, sign-ins, the proxy, usage

- Files: `models`, `credentials`, `accounts`, `proxy`, `plan-usage`, `fast-model`, and `thinking-time`, plus a new `registry.ts` that takes over `harness.ts:33-38`.
- Exports:
  - The registry and models: `models`, `getCatalog`, `watchModels`, `checkChoice`, `defaultChoice`, `cacheRetention`, `askFast`, and `fastModelId`.
  - Keys and sign-ins: `exaKey`, `watchAccounts`, `signIn`, `answer`, `cancel`, and `signOut`.
  - The proxy and usage: `saveProxy`, `removeProxy`, and `watchPlanUsage`.
  - Settings: `updateSettings`, until settings get their own home (see the open questions).
- Internal: `credentials`, `deviceId`, `proxyProvider`, `onProxyChange`, `pollProxy`, `proxyUsage`, `PROXY_ID`, `refreshProxy`, `trackPlanUsage`, `timeThinking`, and `refreshModels`.
- Must stop: `hubChoice`, `HUB_MODEL`, and `hubFolder`. They move to `profiles/hub.ts`.
- Callers: `socket`, `sessions`, `profiles`, `agent`, `voice`, and `commit-message`.
- This is the step that ends most of the cycle.

### `sessions/`: everything about one conversation as Bica sees it

- Files: `sessions.ts` split by job, plus `projection.ts` and the session tools.

  ```
  sessions/
    index.ts         public API
    store.ts         SessionDoc, summaries, dirty set, listSessions, watchSessions, profileOf
    create.ts        createSession(opts), spawn, fork, archive, rename, cleanUpWorktree
    prompts.ts       submit, withdraw, push, stop, configure, compact, cleanUpContext, refreshInstructions
    notes.ts         runState, watchers, tell, runEnded, and an onRunEnded event
    read.ts          readSession, recentMessages, lastReply, runOutcome, textOf, recentPrompts
    names.ts         nameSession, retitle, branchName, cleanTitle
    lanes.ts         claimEdit, setLane, renameBranch
    conversation.ts  watchConversation, conversationDetail, keptEntries
    projection.ts    moved as is
    tools.ts         session-tools.ts, moved inside
  ```

- Exports, for the socket: `watchSessions`, `watchConversation`, `conversationDetail`, `createSession`, `submit`, `withdraw`, `push`, `stop`, `configure`, `compact`, `cleanUpContext`, `markSeen`, `fork`, `archive`, `rename`, `setLane`, `renameBranch`, `setProfile`, `setVoice`, and `cleanUpWorktree`.
- Exports, for other modules: `listSessions`, `sessionWorkspace`, `tell`, `onRunEnded(listener)`, `recentPrompts(cwd, lane?)` for commit messages, and `SessionTools(profile)`.
- Exports for `voice` only: a `VoiceTurn` handle covering what `voice.ts:170-260` does today. It covers submitting a hand-off, aborting, reading the live run, refreshing instructions, and retitling. This replaces `refreshInstructions`, `retitle`, `voiceSettings`, and `VOICE_TITLE`.
- Internal: `SessionDoc`, `noteMessage`, `notifyWhenIdle`, `spawnSession`, `readSession`, `recentMessages`, `retireSessions`, `claimEdit` (reached through a hook that `coding-tools` gets), `queued`, `unqueue`, `newestTurn`, and the three run-tracking maps.
- Must stop: knowing about the hub. `findHub`, `openHub`, `updateHub`, the hub alert at `:314`, and the routing check at `:711` become profile questions such as `profile.hearsAlerts` and `profile.passesModelToChildren`.
- Callers: `socket`, `profiles`, `terminals/tools`, `git/`, `notifications/`, and `voice`.

### `profiles/`: what kind of session this is

This is the example the user asked about. Today it is a table. It should be the one place that says, per profile, which tools a session has, which instructions it gets, which model it starts on, which panels it shows, whether Bica tends it while idle, and how it relates to other sessions.

- Files: `profiles.ts`, `instructions.ts`, `skills.ts`, and `long-lived.ts`, plus the hub parts pulled out of nine files into `hub.ts`.

  ```
  profiles/
    index.ts          public API
    definitions.ts    coding, assistant, hub: the server half of each
    instructions.ts   sections and render(), no profile flags inside
    skills.ts
    hub.ts            HUB_MODEL, hubChoice, hubFolder, hubProjects, ownFolder file tools
    upkeep.ts         was long-lived.ts; started by startUpkeep(), not by import
  ```

- Exports:

  ```ts
  export type { ProfileId } from '../../lib/profiles';
  export interface ServerProfile {
    extensions: Extension[] | null; // null: the host default
    choice(): Promise<ModelChoice>; // its starting model
    snapshot(cwd: string): Promise<Snapshot>; // memory index, project list
    instructions(s: InstructionsInput): Promise<string>;
    passesModelToChildren: boolean; // false for hub
    hearsAlerts: boolean; // hub hears every ask and error
  }
  export function profile(id: ProfileId): ServerProfile;
  export function installProfiles(): void; // registers every extension at boot
  export function startUpkeep(): () => void;
  export { hubFolder } from './hub';
  ```

- Internal: the instruction text constants, `render`, `gitbutler()`, `loadMemory`, `hubProjects`, `HUB_MODEL`, the `ownFolder` wrapper, `skillsSection`, and every upkeep constant.
- The shared half stays in `src/lib/profiles.ts` (label, about, panels, long-lived), since the client needs it.
- Callers: `sessions` (for `profile(id)`), the flat `hub.ts` below, and boot (for `installProfiles` and `startUpkeep`).

`openHub` and `updateHub` can't live in `profiles/`. They create and reconfigure a session, and `sessions` already imports `profiles`, so that would be a cycle. They move to a flat `src/server/hub.ts` of about 40 lines that uses both modules and is called only by `socket`. `openHub` becomes `createSession({ profile: 'hub', cwd: folder })`, with no `projectId`, instead of a second `createConversation`. A future profile, such as a reviewer or a docs writer, then means one entry in `definitions.ts` and maybe its own tool file, and no edits to `sessions` or `agent`.

The dependency between tools and sessions can't fully disappear. Session tools call `sessions`, `sessions` asks `profiles` for extensions, and `profiles` lists the session tools. The plan keeps one lazy edge in one known place, `installProfiles()`, called at boot, in place of seven scattered `import()` calls. The Durable registry replaces an installed extension by name, so reinstalling on each dev reload also fixes the "harness pins old tool code" problem that the dynamic imports work around today.

### `git/`: git, GitButler, and changes in folders without git

- Files: `workspace.ts`, `butler.ts`, `session-changes.ts` (renamed `shadow.ts`), `commit-message.ts`, and `editor.ts`.
- Exports:
  - Plain git and files: `open`, `watchStatus`, `watchFiles`, `readText`, `diff`, `stage`, `unstage`, `commit`, `discard`, `push`, `pull`, and `openInEditor`.
  - Commit messages: `suggestCommitMessage`.
  - GitButler: `isButler`, `watchButler`, `commitLane`, `pushLane`, `landLane`, `checkUpstream`, `pullTarget`, `undoLast`, `assignChanges`, `lanePaths`, `ensureLane`, `newLane`, `renameLane`, and `claim`.
  - Session changes: `aroundTool`, `watchSessionChanges`, `sessionDiff`, and `discardSessionChanges`.
- Internal: `git()`, `polled`, `readRepo`, `toText`, `pendingChanges`, `repoDir`, `but()`, the lane owners file, and `laneNames`.
- Must change: the two `inside` functions get distinct names, `resolveInside` (throws) and `relativeInside` (null). The shadow-git code takes `cwd` from its caller instead of importing `sessions.sessionWorkspace`, which ends the `git → sessions` edge. `commit-message` takes recent prompts from `sessions.recentPrompts` instead of opening conversations itself.
- Callers: `socket`, `sessions/lanes.ts`, `profiles/instructions.ts` (`isButler`), and the coding tools.

### `terminals/`: shells and the agent's terminal tools

- Files: `terminals.ts` and `terminal-tools.ts`, moved inside.
- Exports: `watchTerminals`, `watchTerminal`, `createTerminal`, `writeTerminal`, `resizeTerminal`, `stopTerminal`, `restartTerminal`, `removeTerminal`, `terminalsIn`, `allTerminals`, `commandDone`, `terminalState`, and `TerminalTools`.
- Internal: `interruptTerminal`, `settle`, `tail`, `terminalInfo`, and the zsh setup.
- Today `terminal-tools` imports 10 functions from `terminals`. Inside one folder, 4 of them stop being public.
- Callers: `socket`, `sessions` (setup command, archive), and `profiles`.

### Notifications: removed

Web Push is unused and goes (see below), so there is no `notifications/` module, no `onRunEnded` event, and no presence topic.

### Agent tools that belong to no feature

`coding-tools`, `web-tools`, `codemode-tool`, `ask-tool`, `summary`, `tool-time`, and `fit-image` go in `agent/tools/`. They export `CodingTools`, `createWebTools`, `createCodemode`, `AskTool`, `ASK`, `withSummary`, and `timeTools`. `fit-image` stays internal, except for its test. `CodingTools` gets the GitButler claim and the shadow-git wrapper as hooks from `git/` and `sessions/`, so it doesn't import `sessions` at all.

## What to remove first

Removing a feature nobody uses beats any restructure: fewer files to move, fewer edges in the cycle, smaller interfaces. The live data in `.data` shows which features are in use. The user agreed to remove the first four.

1. GitButler, about 1,500 lines. No project is in GitButler mode (every `.git/HEAD` points at a normal branch), and `lanes.json` holds one workspace with no files. It spans `butler.ts` (412), `ButlerPanel.tsx` (642), `LanePicker.tsx` (81), about 130 lines of `sessions.ts` (`claimEdit`, `branchName`, `setLane`, `renameBranch`, the `claiming` lock, the `lane` parameter), about 60 lines of `socket.ts`, 37 lines of `protocol.ts`, the `gitbutler` instructions section, the lane options in `commit-message.ts`, and bits of `Sidebar`, `Inspector`, the home page, and the session page. Removing it also takes out the `coding-tools → sessions` dynamic import, `instructions → butler`, two `globalThis` entries, the second `inside`, the `polled` and `readRepo` exports of `workspace.ts`, and a fast-model call that every first edit waits up to 5 seconds on. The `lane` field stays in stored `SessionDoc`s, unread, which is harmless.
2. Web Push, about 550 lines. `notify.ts` (142), `push.ts` (160), `public/sw.js` (42), most of `lib/notifications.ts` (166), `scripts/test-bun-push.ts`, the `presence` topic, three `push.*` calls, the Settings toggle, `.data/push.json`, and `docs/notifications.md`. It also removes the `sessions → notify` call, the dynamic import back, `runOutcome`, and three `globalThis` maps. The app badge and `pageFocused` live in the same client file. `pageFocused` stays as a tiny helper. The badge stays, since `setAppBadge` works without push while the app is open (step 0b).
3. Plan meters read twice, about 250 lines. `plan-usage.ts` fetches Claude and ChatGPT plan windows with Bica's own sign-ins (`fetchClaude`, `fetchCodex`), and `proxy.ts` reads the same windows from the proxy's management API (`claudeWindows`, `codexWindows`). The API key spend in `plan-usage.json` is empty, so `trackPlanUsage` records nothing. Keep only the proxy's meters: `plan-usage.ts` shrinks to reading `proxyUsage`, and the `trackPlanUsage` hook leaves the harness, which takes one more edge out of the cycle. A setup without the proxy shows no meters, which is acceptable for a fallback.
4. Shadow git for folders without git, about 450 lines. `session-changes.ts` (226), `SessionChanges.tsx` (89), the `session.changes` topic and calls, and the no-git branches in `workspace.ts` and the client exist for the `vault` project and chat folders, the only folders without git. Bica runs `git init` instead when such a folder is added and when a chat folder is made, so the normal Git tab covers them. The vault gets a `.git` folder, and "what this session changed" becomes "what changed since the last commit". Existing folders without git need one `git init` by hand.
5. Pre-profile compatibility, a few lines. `profileOf` still reads the old `assistant` flag. Not worth a migration on its own.

These stay, because the data shows they are in use or they are the point of Bica: the CLI proxy (every model goes through it), voice, codemode, terminals, the hub, and profiles. Sign-ins stay too, but they are already thin: pi-ai runs the OAuth flows and stores nothing itself. `accounts.ts` (255 lines) only lists pi-ai's providers for Settings with a short guide each, and relays pi-ai's prompts, such as a pasted code, to the browser. `credentials.ts` (70) saves what pi-ai hands back in pi's `auth.json` shape. The only sign-in code Bica owns outright is the proxy's, in `proxy.ts`.

## Proposed layout

```
src/server/
  socket.ts              transport: one table of calls and topics (stays)
  ws-log.ts              (stays)
  live.ts                the watch primitive (stays)
  paths.ts               DATA_DIR, BICA_HOME, dataFile(name)   new, tiny
  voice.ts               (stays flat, uses sessions' VoiceTurn)
  hub.ts                 openHub, updateHub: a session of the hub profile   new, small
  projects.ts            (stays flat)
  github.ts              (stays flat, only projects.ts imports it)
  agent/
    index.ts             getHarness, context, conversation, installExtensions
    harness.ts
    tools/               coding, web, codemode, ask, summary, tool-time, fit-image
  providers/
    index.ts
    registry.ts          the pi-ai models, from harness.ts
    models.ts  credentials.ts  accounts.ts  proxy.ts  plan-usage.ts  fast-model.ts  thinking-time.ts
  sessions/
    index.ts
    store.ts  create.ts  prompts.ts  notes.ts  read.ts  names.ts  lanes.ts
    conversation.ts  projection.ts  tools.ts
  profiles/
    index.ts
    definitions.ts  instructions.ts  skills.ts  hub.ts  upkeep.ts
  git/
    index.ts
    workspace.ts  butler.ts  shadow.ts  commit-message.ts  editor.ts
  terminals/
    index.ts
    terminals.ts  tools.ts
```

The order of dependencies runs one way:

```
socket → hub, profiles, sessions, git, terminals, providers, projects, voice
hub → sessions, profiles
sessions → profiles, agent, providers, projects, terminals, git
profiles → agent, providers, git (isButler), projects (project list)
terminals/tools, sessions/tools → sessions (through installProfiles, the one lazy edge)
agent → providers
providers → (nothing in the app)
```

`socket.ts` also becomes the explicit boot. It calls `installProfiles()` and `startUpkeep()` once, in place of `import './long-lived'`.

A lint rule can hold the boundary: oxlint's `no-restricted-imports`, with patterns like `src/server/*/!(index)` for imports from outside a folder. That rule would be the only new tooling.

## Migration

Status: steps 0 to 9 are done, plus `#server` and `#lib` import aliases. Where the result differs from the plan below:

- Step 8 keeps `openHub` and `updateHub` in `sessions/hub.ts`, since they create and reconfigure sessions. Profiles answer with `serverProfile(id)`, whose `passesModel` and `hearsAlerts` flags replace the hub checks in sessions.
- Step 9 is smaller: the harness keeps its registry on `globalThis` and installs every tool again on each reload, which fixes stale tool code. The session tools keep their lazy imports, and the harness still imports every tool, so there is no `installProfiles()`.
- Three deep imports stay on purpose. The harness imports `sessions/tools`, and the tool files import `agent/tools/summary`, because going through an index would load the harness while it loads them. A test fixture imports `sessions/projection`.
- `paths.ts` creates `.data` when a file path is first built, not before each write.

Each step is one commit. Run `bun run check`, `bun run lint`, and `bun run test:bun` after every step, and smoke-test the dev server, since boot runs through Vite's SSR runner.

0. Done on the `codebase-architecture-review` branch, in four commits. Removal, one commit per feature, before any move, so the later steps move less code. Do them in the order below. The first three are low risk, since nothing uses them. The shadow git changes what a session in the vault shows, so check the vault's Git tab after it. Each list below covers the files to delete, the imports and call sites to clean, the settings and UI to remove, and the data and docs to update.

### Step 0a: GitButler

- Delete: `src/server/butler.ts`, `src/components/ButlerPanel.tsx`, `src/components/LanePicker.tsx`, and `src/components/ui/Logo.tsx` (GitButler's mark).
- Server call sites:
  - In `socket.ts`, remove the `./butler` import, the nine `butler.*` calls, the `session.lane` call, `renameBranch`, and the `butler.status` topic.
  - In `sessions.ts`, remove the `./butler` import, `claimEdit`, the `claiming` map, `branchName`, `setLane`, and `renameBranch`. Also remove the `lane` parameter of `createSession` and the lane lines in `createSession` and `refreshInstructions`.
  - In `coding-tools.ts`, remove the `claiming` wrapper and its dynamic import of `sessions`. Point `ownFolder` at `workspace.ts`'s `inside`, which throws instead of returning null.
  - In `instructions.ts`, remove the `isButler` import, the `gitbutler()` section, and the `lane` parameter of `buildInstructions`.
  - In `profiles.ts` (`instructionsFor`) and `commit-message.ts`, remove the `lane` and `paths` options and the lane filter in `agentRequests`.
  - In `workspace.ts`, stop exporting `polled` and `readRepo`, and remove the "a GitButler lane's" paths option of `pendingChanges` if nothing else uses it.
- Shared and client:
  - In `lib/protocol.ts`, remove `ButlerLane`, `ButlerStatus`, and `ButlerUpstream`, the `butler.*` and `session.lane` calls, the `butler.status` topic, and the `lane` option of `session.create`. `SessionSummary.lane` goes too.
  - In `lib/workspace.ts`, remove the `butler.status` topic and the lane functions (`commitLane`, `pushLane`, the lane suggest, `renameLane`, `landLane`, `assignChanges`, `checkUpstream`, `pullTarget`, `undoLast`).
  - Remove `isButler` from `lib/projects.ts`, `setSessionLane` and the `lane` argument of create from `lib/sessions.ts`.
  - UI: the lane picker on the home page (`routes/index.tsx`) and the session page (`routes/s/[id].tsx`, `butlerWorkspace`). The Butler tab in `Inspector.tsx`. The lane chip and the `butler` group flag in `Sidebar.tsx`. The `isButler` checks in `CommandPalette.tsx`, `OpenFile.tsx`, and `CommitBox.tsx`. The GitButler fixtures in `lib/fixtures`.
- Data: `.data/lanes.json` can be deleted. The `lane` field stays in stored `SessionDoc`s, unread.
- Docs: the GitButler section of `docs/git.md`, and its mentions in `architecture.md` (the `lanes.json` row), `instructions.md`, `projects.md`, `files.md`, and `UI.md`.

### Step 0b: Web Push, keeping the badge

- Delete: `src/server/notify.ts`, `src/server/push.ts`, `public/sw.js`, `scripts/test-bun-push.ts`, and `docs/notifications.md`.
- Server call sites:
  - In `socket.ts`, remove the `./notify` import, the `push.key`, `push.subscribe`, and `push.unsubscribe` calls, `push.key` in `READS`, and the `presence` topic.
  - In `sessions.ts`, remove the `./notify` import, the `notifyRun(...)` call in `load()`, and `runOutcome`, which only `notify` used.
- `src/lib/notifications.ts` shrinks to what doesn't need push, and could be renamed `lib/badge.ts`:
  - It keeps the `pageFocused` signal, which `routes/s/[id].tsx` uses.
  - It keeps a `useBadge(sessions)` hook, made from `useNotifications`, with only the `setAppBadge` and `clearAppBadge` effect. The badge works without push while the app is open.
  - It drops `supported`, `blocker`, `notificationsOn`, `setNotificationsOn`, `register`, `subscribe`, the `presence` topic, closing shown notifications, and the service worker message listener.
- Shared and client: in `lib/protocol.ts`, remove the three `push.*` calls and the `presence` topic. In `lib/socket.ts`, remove `presence` from `UNSAVED` and its check in the cache. `Sidebar.tsx` calls `useBadge` in place of `useNotifications`.
- Settings and UI: the Notifications toggle in `routes/settings.tsx` (the `blocker`, `notificationsOn`, and `setNotificationsOn` imports and the checkbox around lines 25 to 64).
- Data: `.data/push.json` can be deleted. Browsers that subscribed keep a dead service worker until it is unregistered. Unregister it once on load, or leave it, since it only reacts to pushes.
- Docs and scripts: in `AGENTS.md`, remove the `notifications.md` index line, and drop `test-bun-push.ts` from `test:bun` in `package.json`. Move the badge's one paragraph from `notifications.md` into `docs/sessions.md`.

### Step 0c: the direct plan meters

- In `plan-usage.ts`, delete `trackPlanUsage`, `addSpend`, `poll`, `tokenFor`, `getJson`, `fetchClaude`, `fetchCodex`, `codexAccount`, `windowLabel`, the `PLANS` table, and `.data/plan-usage.json`'s store. What stays is the `plan.usage` topic over `proxyUsage()`, a few lines that could move into `proxy.ts`, which deletes the file.
- In `harness.ts`, remove the `trackPlanUsage` import and call.
- In `lib/protocol.ts`, remove `ProviderUsage.spend` if the proxy never fills it. The proxy sets it to `null` at `proxy.ts:353`.
- UI: the API key spend line in `PlanUsage.tsx`. `ContextMeter`'s per-session "Cache and spend" stays, since it reads the session's own `pi.usage` doc, not this file.
- Data: `.data/plan-usage.json` can be deleted. Docs: the plan usage part of `docs/providers.md` and the `plan-usage.json` row in `architecture.md`.

### Step 0d: shadow git, replaced by `git init`

- Delete: `src/server/session-changes.ts` and `src/components/SessionChanges.tsx`.
- Server call sites:
  - In `socket.ts`, remove the `session.diff` and `session.discard` calls, `session.diff` in `READS`, and the `session.changes` topic.
  - In `coding-tools.ts`, remove the `tracking` wrapper and the `aroundTool` import.
  - In `projects.ts`, run `git init` in `addProject` for a folder without `.git`, and in `createChatFolder`. The `git` flag on a project and the `git: false` branch stay for a folder that can't be a repo.
  - In `workspace.ts`, the no-git branches of `watchStatus` and `watchFiles` stay, but `toText` loses its outside caller.
- Shared and client: in `lib/protocol.ts`, remove the `session.diff` and `session.discard` calls and the `session.changes` topic. In `lib/workspace.ts`, remove `useSessionChanges` and `discardSessionChanges`. Remove the session-change view in `OpenFile.tsx`, and the `plain` tab ("Changes") in `Inspector.tsx`.
- Data: `.data/shadow/` can be deleted. Run `git init` once by hand in the hub's notes folder and the existing chat folders in `~/.bica/chats/`.
- Docs: the folders-without-git section of `docs/git.md`, the `shadow/` row in `architecture.md`, and the mentions in `files.md` and `projects.md`.

1. Mechanical: add `paths.ts`, and replace the 9 `.data` literals and the `BICA_HOME` import in `ws-log`. This is a pure rename.
2. Mechanical: move the pi-ai registry from `harness.ts:33-38` to `providers/registry.ts`, and point `models`, `proxy`, `accounts`, `fast-model`, and `voice` at it. This changes when the proxy refresh starts (module load order), so watch for "unknown model" on a session that resumes after a restart. That gives it low to medium risk. It ends the provider half of the cycle.
3. Mechanical: create `providers/`, `git/`, and `terminals/` folders with `index.ts` files that re-export today's names, and move the files in. Update imports, including `scripts/test-bun-*.ts` and `src/lib/fixtures/conversation.ts`. There is no behavior change. `git mv` keeps the history.
4. Mechanical: move `terminal-tools.ts` into `terminals/`, and stop exporting `interruptTerminal`, `settle`, `tail`, and `terminalInfo` from the index.
5. Interface: rename the two `inside` functions. In `git/`, stop exporting `polled`, `readRepo`, `toText`, and `pendingChanges`. Give `shadow.ts` its `cwd` from the caller. Add `sessions.recentPrompts` and use it in `commit-message`.
6. Interface: split `sessions.ts` into the files listed above, with `sessions/index.ts` exporting only the public list. Move `session-tools.ts` and `projection.ts` in. This is mostly moving code. The risk is in the three `globalThis` maps, which must keep their keys so a dev reload still sees one state.
7. Interface: replace `createSession`'s 11 positional parameters with one options object. Add the `VoiceTurn` handle and move `voice.ts` onto it.
8. Behavior: build `profiles/`. Pull the hub from `models`, `instructions`, `coding-tools`, `session-tools`, `sessions`, and `harness` into `profiles/hub.ts`. Turn `instructionsFor`'s `assistant` boolean into per-profile section lists. Move `openHub` and `updateHub` to the flat `hub.ts`, with `openHub` calling `createSession`. Check that the rendered instructions for each profile stay byte-identical before and after, by diffing `instructions` for one session of each kind, or every session's prompt cache breaks once. The client's tag parsing in `lib/context-usage.ts:244` must keep working.
9. Behavior: boot explicitly. Replace `import './long-lived'` with `startUpkeep()`. Replace the harness's tool imports with `installProfiles()`, called before `getHarness()` resumes runs. The restart-recovery test (`scripts/test-bun-recovery.ts`) is the gate here. If extensions are installed after `harness.resume()`, resumed runs lose their tools. This is the riskiest step.
10. Not needed any more: it inverted the notifications dependency, and step 0 removes Web Push.

Steps 1 to 4 are safe to do in one sitting. Steps 5 to 7 can run in any order. Step 8 depends on 6, and step 9 on 8.

The risks:

- In dev, the harness lives on `globalThis` and outlives module reloads (`harness.ts:88`). Any step that changes which module instance a tool closes over can bring back the stale-code bug the dynamic imports were added for.
- The prompt cache depends on the exact instructions text. Step 8 must not reorder sections.
- Pi Durable stores the extension selection by name. Renaming an extension (`hub-file-tools`, `hub-session-tools`, `coding-tools`, and so on) orphans stored selections, so names stay as they are.
- `SessionDoc` keeps the kind `bica.session` (`sessions.ts:98`) and its field names. Moving the code must not touch the stored shape.

## What not to group

- `socket.ts` stays one file. It is long, but it is one flat table of calls and topics with argument checks, and reading it shows the whole API. Splitting it per module would spread the protocol over seven files and hide which calls skip the replay cache.
- `live.ts` stays as it is. It is the best deep module in the server.
- `projects.ts` and `github.ts` stay flat. `projects.ts` is already a clean owner of `projects.json` and worktrees, and `github.ts` has one caller. A folder would add an `index.ts` and nothing else.
- `voice.ts` stays one file. It is self-contained apart from its reach into sessions, which `VoiceTurn` fixes.
- `editor.ts` (14 lines) goes into `git/` only because it shares `open()`, not because it needs a module.
- There is no "services" layer, dependency injection container, or event bus. The one event, `onRunEnded`, is a plain listener set like `live`'s.
- `globalThis` state gets no wrapper. A shared helper for 9 call sites would hide why each one exists, and each has its own comment. The duplicated run map in `notify` goes with Web Push in step 0.
- `src/lib/protocol.ts` stays as the one contract. Splitting it per module would break the "one file shows the wire" property the client relies on.
- The client is out of scope. It already has one store per server area (`lib/sessions`, `lib/projects`, `lib/workspace`, `lib/terminals`, `lib/voice`, `lib/models`, `lib/accounts`), which mirrors the proposed server modules well.

## Open questions

1. Decided: remove GitButler, Web Push, the direct plan meters, and the shadow git. The app badge stays (step 0b).
2. How far should the restructure go? There are three options:
   - Stop after step 4: folders and smaller exports, no behavior change.
   - Go through step 7: `sessions` split and voice cleaned up.
   - Do every step, including profiles as a real module.
3. Should settings get their own small module? `settings.json` holds model defaults, a git habit, and hub settings in one file owned by `models.ts`. One option is a `settings.ts` that owns the file, with each module reading its own keys. The other is leaving it in `providers/`.
4. Should agent tools live with their feature, or together in `agent/tools/`? The proposal puts session and terminal tools with their features, to keep those features' internals private, and generic tools in `agent/tools/`. A single tools folder is simpler to find but leaks more.
5. Do you want the lint rule that forbids deep imports into a module folder, or is the `index.ts` convention enough?
6. Should profiles stay defined in code, or is a later profile file in `~/.bica/` (like skills) on the table? The proposed `ServerProfile` shape would allow it, but nothing here builds it.
7. `projection.ts` is imported by a client fixture. Should it move to `src/lib/` as shared, pure code, or should the fixture stop using it?
