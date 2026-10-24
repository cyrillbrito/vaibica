# Bica as a lean core with extensions

The plan for turning Bica into a small core where every feature is an extension. What exists today is in [extensions.md](../extensions.md). The research behind this plan, with links, is in four reports:

- [agent-harness-extensibility.md](./extensibility/agent-harness-extensibility.md): Pi Durable's extension surface, Pi, oh-my-pi, Claude Code, opencode, Codex, Amp, and others.
- [editor-plugins.md](./extensibility/editor-plugins.md): ProseMirror, CodeMirror 6, Lexical, lazy.nvim, Rollup: order, state, and dependencies.
- [app-ui-extensibility.md](./extensibility/app-ui-extensibility.md): Obsidian, VS Code, JupyterLab, Backstage, AG Grid, tldraw, Grafana: slots, ids, settings, crash isolation.
- [dynamic-loading.md](./extensibility/dynamic-loading.md): loading outside Solid code at runtime, and why it waits.

The reports argue against an earlier plan that is gone now. Read them for their findings and links.

## Direction

- Core stays as small as it can. With every extension off, Bica is a plain chat with an agent that can't touch files.
- Core is Pi Durable, the extension contract and resolver, sessions (transcript, composer, queue, forks, status, archive), the socket, the layout with empty slots, the command palette with no commands, provider sign-in with a model picker, and git as a thin service for projects, worktrees, status, and diffs.
- Everything else is an extension: the tool packs (coding, web, codemode, `ask`, session tools, terminal tools), the Git tab and commits, file and diff views, terminals, voice, night runs, the hub, assistant mode, upkeep, context alerts, short replies, the proxy and plan accounts.
- The extension is the one way to add anything: tools, prompt sections, behavior, UI, agents. Core capabilities are generic, so any extension can hook into them, as in Pi Durable, CodeMirror, and ProseMirror.
- Only built-ins for now, as plain imports. One global switch each, and an extension decides which sessions it applies to.
- Profiles became agents ([agents.md](../agents.md)): what the model gets (instructions, model, effort, tools, skills), one plain object per file, which may grow into a folder like Vercel's [eve](https://eve.dev/docs/reference/agent-files). Behavior such as the night scheduler or the hub's panels is extensions, and an extension can ship its own agents.

## How we get there

One extension at a time, each pushing on a different seam. After each one, review core: which hook it needed, whether that hook is named after a core concept, and whether a second extension could use it. Abstract on the second or third use, not the first. A provisional piece gets reshaped when the next extension needs something close, not built around.

These are the extensions to build, in this order. Each one ends with a "What it taught" section below, like the one for `ask`, and earlier extensions move onto any hook a later one reshapes.

1. Web search, done: tools, a setting (the Exa key), and access to a provider. Brought `settings` to the manifest, and the `extensions` topic so the switch stops riding on `models`.
2. Terminals, done: the first UI beyond a transcript row. Brought requests and topics the extension owns (`ext:<id>/…`), hooks named after core's events, pages under `/e/<id>/`, a command registry, and slots for sidebar rows and ⌘K places.
3. Voice: calls, hand-offs, and dictation in one extension. Brings `composer.above` and a composer button, and is the second to reach a provider.
4. Git tab: the first `rightPanel.tab`, with an order field, since terminals kept their sidebar rows and full page instead of a tab. The second user of pages and commands, so those get reshaped here. Pulls a `Vcs` service out of core, which keeps projects, worktrees, status, and diffs.
5. GitHub: pull request numbers and states on branches, through `gh`, and later opening pull requests. Brings a slot for badges on a branch or workspace row, and a search source for the workspace picker.
6. Jira: ticket keys in branch names, as badges and links. The second user of both GitHub's slots, so they get reshaped here, and the key parsing in `src/lib/branch.ts` leaves core.
7. File and diff views: the third tab and the second user of `Vcs`, plus diff comments that go back to the agent.
8. Assistant mode: the first agent an extension ships, and the first lifecycle hook, `session.idle`, for the upkeep that clears and compacts while the session sits. Brings a button on the new-session form and a mark on the context chip. The memory index reaches every session, so it stays in core.
9. Night runs: the second agent and the second user of the lifecycle hooks, plus a scheduler, and the conflict with `ask`, settled by night leaving out extensions that need someone to answer.
10. Hub: `center.view`, its own agent, and the session tools. It keeps itself small with assistant mode's upkeep, which makes it the first extension that requires another, through a service. The second reader of `waitingOn`, so `awaitsAnswer` and `waitingOn` become a status hook here at the latest.

Nothing else is planned. The tool packs (coding, codemode) stay in core until these are done.

How extensions meet, kept as small as the evidence allows:

- Through the model first. An extension adds its tools and prompt lines to the sessions it applies to, and an agent uses whatever it has. Night or assistant mode never needs to know web search exists.
- An agent leaves tools out by a trait of the tool, such as needing someone to answer, never by an extension's name. Build this when night runs or the hub move, which are the first real cases.
- Code calling another extension's code goes through a small service that core or the consumer defines. Build it only when a real case shows up, which is the hub using assistant mode's upkeep.
- No event bus and no shared interfaces in advance.

## What `ask` taught

Moving `ask` out ([extensions.md](../extensions.md)) showed what fits and what doesn't yet:

- Off as "not installed" fits Durable exactly. Sessions store extension names and Durable skips what the registry lacks, so the resolver lists every extension that applies and the registry alone decides.
- A manifest earns its place even for built-ins: the session list's status runs on the server, the transcript in the browser, and both read the same traits.
- A switch lands at the next model request, not the next turn, because Durable resolves the agent from the registry at each step. True next-turn needs the selection pinned per turn, from Durable or from Bica.
- `awaitsAnswer` bundles three behaviors only `ask` has (waiting status, its own row, folding the answer in), and `waitingOn` serves one consumer. Both are provisional.
- `ask` itself says it skips night sessions, so one extension knows another. Better: night excludes extensions that need someone to answer.
- The switch rides on the model settings and the `models` topic. An `extensions` topic with each one's state and errors would be its home.
- The server half is still imported when off, only not registered. The browser half truly never loads.

## What web search taught

Moving web search out ([extensions.md](../extensions.md)) needed less than planned, and confirmed most of what `ask` built:

- Tools, a guide line, and `appliesTo` were enough on the server. Agents no longer list the pack: the extension says it applies to every agent but the hub. Both built-ins now exclude one agent by id, so when night and the hub become extensions, that should turn into traits an agent declares, such as "nobody answers" or "coordinates only", which extensions check.
- Moving a pack out of an agent's list moves its tools after the agent's own, which rebuilds the prompt cache once. Stored lists keep the old place, and Durable doesn't mind. The Durable name stays, since sessions store it.
- Settings came in as `settings` on the manifest, with one kind, `secret`, kept in `auth.json` under its own key. Keeping the old `exa` key meant no migration, but keys aren't namespaced, so that part is provisional. Settings draws the rows from the manifest, and the server half reads with `readSetting(manifest, key)`, typed against the manifest.
- "Access to a provider" turned out to be a fake account: Exa sat in Providers with a special case in five places. As a secret it left the providers module for good. Voice is the first extension that truly reaches a pi-ai provider.
- The `extensions` topic carries each extension's switch and setting status, and `extension.update` changes either. The switch is off `models`, but `settings.json` is still written only by the models module, so the switch is saved there.
- The generic tool row needed a short label and an icon per tool, so the client half got `tools` (provisional). It applies on or off, so past calls keep their look.
- The leak test now also catches a name used as an object key, such as a tool name in a lookup table, and setting keys.

## What terminals taught

Moving terminals out ([terminals.md](../terminals.md)) touched more of core than the plan expected, since terminals were never a panel: they were sidebar rows, a full page, ⌘K entries, worktree setup, and lines in `list`.

- The UI stayed as it was, so the panel tab moves to the Git step. Instead, three small provisional pieces, each with terminals as the only user: pages, commands, and the `sidebar.workspace` and `palette.search` slots.
- Pages and commands are registries, not slots. Core owns one route, `/e/[ext]/[...path]`, and draws the extension's page whose path matches, as Grafana's app plugins own `/a/<plugin-id>/`. The route table stays static, so it would still work if extensions loaded at runtime, and an off extension's page is a plain not found. The cost: the terminal's address moved from `/t/<id>` to `/e/terminals/<id>`, and `paths` can't type it. Commands are records by id, as in VS Code and Obsidian, and `runCommand(id)` runs one from anywhere. Core's own ⌘K entries stay its own list: they close over component state and second pages, so moving them isn't cheap yet.
- A command registry can't list one entry per terminal, so jumping to one needed `palette.search`, a hook that returns places. Sessions and workspaces work the same way in core, so it may become core's own path when ⌘K is rebuilt on the registry.
- UI hooks need data, not only components: the sidebar must know a workspace has rows to keep it out of Parked. So `sidebar.workspace` has a `use()` hook that runs in the sidebar's scope and returns the rows, plus a lazy component per row. Hooks run only once the switches are known, since the manifest's default would subscribe to an off extension and the server refuses it.
- An extension's page names its workspace with `usePageWorkspace`, so the right panel and ⌘K follow it. Before, `useCurrentWorkspace` read terminals by the `/t/` prefix.
- Hooks on the server came out as events core already had: `worktreeCreated`, `beforeWorktreeRemove`, `sessionArchived`. Durable's `hooks` shape fit (named callbacks on the extension), without an event bus. `list` needed `inWorkspace`, lines per workspace, instead of a `Terminals` service.
- `appliesTo` now also returns a list of the extension's Durable extensions, because the hub gets a read-only pack. Ask and web still return a boolean. The hub's terminal rule moved from its role into its `terminal_read` description, and night's "stop your terminals" became "stop what still runs".
- Extension-owned requests and topics fit the socket with little change: names are `ext:<id>/<name>`, the server routes by prefix and refuses while off, and each side types them from one `protocol.ts` in the folder. Maps must be `type`s, not interfaces, to fit `CallMap`. Which calls rerun on a re-send (`reads`) and which topics stay off the device (`unsaved`) turned out to be per-call facts the extension declares.
- Tools that need sessions (`tell`, the session's folder) import them lazily: the extension lists load inside the agents' module graph, and a static import loops.
- settings.json stays in the models module. Terminals has no setting, so moving it would be building ahead; voice or the first plain setting should move it.
- Switching terminals off leaves open shells running, unseen, until Bica restarts. Closing them would need an "off" lifecycle hook, which nothing else needs yet.
- Test data has terminal rows keyed by the topic's `ext:` name, untyped, so deleting the folder leaves dead data rather than a broken build.

What voice should expect:

- `composer.above` and a composer button are slots like `sidebar.workspace`: a `use()` hook for the data a strip needs, and a lazy component. Reuse the shape rather than invent one.
- Its requests (`voice.start`, `voice.transcribe`, `voice.stop`) move to `ext:voice/…` with `extensionSocket`, and its session field (`voice` on `SessionSummary`) is the first extension-owned piece of session state, which has no home yet.
- If it needs a shortcut or a ⌘K entry, use the command registry. If it needs to react to a session event, add a hook named after that event next to `sessionArchived`.
- Reaching a provider is still unbuilt: voice is the first. Settings that aren't secrets (voice, speed) are where settings.json should leave the models module.

## Ideas for the contract

From the research, to reach for when an extension needs them:

- A status hook: an extension says a session waits and what it asks. It replaces `awaitsAnswer` and `waitingOn`.
- Transcript transforms: an extension rewrites the transcript's rows, like a remark plugin, so the `question` row kind leaves core. Projection per tool, instead of `wholeArgs`.
- Facets, from CodeMirror: many inputs and one combined value, for prompt sections, agent values, and slots. Order by layer and `before: [...]`, never numeric priorities.
- Contribution records for UI: id, slot, order, `when`, and a lazy component, so any one can be hidden or replaced by id. A `mount(el) => dispose` slot kind for widgets that aren't Solid.
- Three ways to talk, in order: shared state in Durable documents with one writer, typed services by token (`requires`, `provides`), and commands by id. No event bus: the browser renders from state, which is why reconnects work.
- Each extension owns its documents (`ext.<id>.*`) and its socket requests and topics (`ext:<id>/…`), instead of fields in one shared session document.
- Bica-level lifecycle hooks with declared kinds, such as `session.idle` and `worktree.created`, each returning its cleanup.
- Folder discovery with `import.meta.glob` instead of the three lists, once order has an explicit field.
- A marker in the transcript when an extension turns off, so you and the model see why a tool went away.
- Asks for Durable upstream: hooks that write, tool annotations, a lifecycle, hook spend in usage, and a per-turn selection.

## Open

- Will outside code ever load? Then Bica needs one shared Solid copy through a build shim, one combined Tailwind sheet, `@theme static` so tokens exist at runtime, and pure-JS compilers for the `bica` binary ([dynamic-loading.md](./extensibility/dynamic-loading.md)). Built-ins need none of it.
- What an agent folder may hold itself, such as tools and hooks, versus what must be an extension, and where user and project agents live.
- Whether projects and workspaces stay core, or become a `Workspaces` service with git as its first provider.
- Switches per project, agent, or session, layered over the global one.
- How extensions that conflict declare it: a capability such as "needs someone to answer" that agents exclude, or explicit `conflicts`.
- Whether worktree setup belongs in core or an extension. It runs in a terminal, so it left with terminals, and with them off no setup runs.
