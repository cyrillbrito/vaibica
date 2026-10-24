# Everything as an extension

October 2026. Decision: Bica isn't built as a lean core with every feature as an extension. Features are plain code in their own folders, with a clean structure, and core imports them by name.

## The vision

Every feature would be an extension, so Bica could one day be shared, and each person could switch on their own features. Core would stay minimal but usable: Pi Durable, sessions with their transcript and composer, the socket, projects and worktrees with git as a thin service, provider sign-in and the model picker, a basic layout, and the command palette with its core commands. Everything else would plug in: the tool packs, the Git tab, file views, terminals, voice, night runs, the hub, and assistant mode.

The ideas behind it:

- Anything is reachable. An extension can add to any part of Bica, wrap it, or replace it, and Bica's own features use the same API, so the API never falls behind the app. The test was whether these could be built: a custom file tree, another version control system under the Git panel, a different voice mode, and a game in the centre view.
- One extension is one folder: a manifest both sides read without running its code, a server half, and a client half. Each has a switch, and decides which sessions it applies to.
- The agent side is Pi Durable's own extensions: tools, prompt sections, hooks, and agents an extension can ship.
- The UI is named places: sidebar sections, the centre view, side panel tabs, transcript rows per tool, and the composer. Pages and commands are registries by id. A built-in can be wrapped or replaced by id, and a crash falls back to it.
- Extensions meet through the model first: a tool reaches every session that has it, so night runs never need to know web search exists. An agent leaves a tool out by a trait, such as needing someone to answer. Code calls another extension only through a small service, and there's no event bus.
- Each extension owns its state, settings, and socket requests, instead of fields in shared documents.
- Later, extensions of your own or a project's would load from `~/.bica/extensions/` and `.bica/extensions/`, with trust per project, a safe mode, and hot reload through Durable's registry.

The models were AG Grid's modules, VS Code's manifest and contribution points, ProseMirror and CodeMirror plugins, JupyterLab's "built-ins use the same API", Obsidian's plugin API, and Pi Durable's own extensions.

## The plan

Move one feature at a time, each pushing on a different seam, and give a hook a generic shape only on its second or third use. The order was web search, terminals, voice, the Git tab, GitHub, Jira, file views, assistant mode, night runs, and the hub. Each step would end with what it taught about the contract.

## What we tried

Three features moved, and a fourth started.

- `ask`: a manifest read by both sides, a switch per extension in Settings, `appliesTo` to pick agents, and a transcript slot for its card. Core still kept the question row and three traits only `ask` used.
- Web search: settings in the manifest for the Exa key. This one went well. It also removed a fake Exa "provider" that had special cases in five places.
- Terminals: socket requests and topics owned by the extension, hooks on core events (worktree created or removed, session archived), pages under `/e/<id>/`, a command registry, and slots for sidebar rows and ⌘K results. The terminal page moved from `/t/<id>` to `/e/terminals/<id>`.
- Voice, unfinished: it needed five more slot kinds and a composer that features could take over, which amounts to a framework built around one feature.

## What we found

- The agent side fit well. Tools, prompt lines, and hooks are what Pi Durable already offers, and moving them cost little.
- The UI side didn't. Terminals left 17 core files, but core gained about 900 lines of generic machinery with one user, and finding "New terminal here" meant going through a slot, a hook, and a lazy component.
- Deep UI resists it. The composer has many modes and conditions, and making it pluggable would make it worse for the one person who uses it.
- Most of the payoff never arrives. With one author and only built-in code, there are no outside users, no isolation to gain, and no code loaded at runtime. Loading outside UI code would also need a shared Solid copy, a Tailwind build at runtime, and compilers inside the `bica` binary.
- Other apps draw the same line. Obsidian's core plugins ship as app code. VS Code keeps terminal, search, and SCM as internal code, and only features like git and language support use its public extension API. Zed's extensions can't touch the UI. JupyterLab makes everything a plugin and pays for it with dependency injection everywhere.

## The decision

Bica is built for one person, so the code serves him, not a plugin API.

- Each feature lives in its own folder and doesn't spread across the app. Core may import it by name.
- Agent-side behavior uses Pi Durable's extensions directly where that's simple: tools, prompt sections, and hooks.
- The UI is plain Solid components, structured well, with no generic slots.
- When a pattern repeats in three features, it gets a shared shape. Not before.

Reopen this only if other people use Bica and want to add their own features, or if loading code at runtime becomes a goal.

## Where it lives

All of it was reverted, and history was rewritten to drop the extension commits. The attempt is kept as the git tag `extensions-attempt`. It holds the code, the full plan with its contract ideas (`docs/explorations/extensibility.md`), and four research reports in `docs/explorations/extensibility/`. A few pieces may come back in plain form: dropping the fake Exa provider, socket names grouped by feature, and hooks on core events.

## Sources

- The research reports at the tag: agent harnesses (Pi, Claude Code, opencode, Codex, Amp), editor plugins (ProseMirror, CodeMirror, Lexical), app UI extensibility (Obsidian, VS Code, JupyterLab, Backstage, AG Grid, Grafana), and dynamic loading.
- [Obsidian core plugins](https://obsidian.md/help/plugins).
- VS Code's [`workbench/contrib`](https://github.com/microsoft/vscode/tree/main/src/vs/workbench/contrib) next to its [`extensions/`](https://github.com/microsoft/vscode/tree/main/extensions).
- [Zed extensions](https://zed.dev/docs/extensions/developing-extensions).
- [JupyterLab extensions](https://jupyterlab.readthedocs.io/en/latest/extension/extension_dev.html).
