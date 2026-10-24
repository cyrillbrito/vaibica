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

Next, in this order:

1. Web search: tools, a setting (the Exa key), and access to a provider. Server only. Brings `settings` to the manifest.
2. Approval before a call: a second extension that makes a session wait for you and draws a card. Settles whether `awaitsAnswer` and `waitingOn` become a status hook. Durable's `beforeTool` can await, so it runs before the call is committed and finds a stored answer after a restart.
3. Night runs: an agent, lifecycle hooks, a scheduler, and the conflict with `ask`.

Later, each with what it needs first: the Git tab and file views (`rightPanel.tab`, a `Vcs` service), terminals (a `Terminals` service), voice and context alerts (`composer.above`), the hub (`center.view`, agents), and small hook extensions like a guard on `git push --force`, lint after an edit, or a cheaper compaction.

## What `ask` taught

Moving `ask` out ([extensions.md](../extensions.md)) showed what fits and what doesn't yet:

- Off as "not installed" fits Durable exactly. Sessions store extension names and Durable skips what the registry lacks, so the resolver lists every extension that applies and the registry alone decides.
- A manifest earns its place even for built-ins: the session list's status runs on the server, the transcript in the browser, and both read the same traits.
- A switch lands at the next model request, not the next turn, because Durable resolves the agent from the registry at each step. True next-turn needs the selection pinned per turn, from Durable or from Bica.
- `awaitsAnswer` bundles three behaviors only `ask` has (waiting status, its own row, folding the answer in), and `waitingOn` serves one consumer. Both are provisional.
- `ask` itself says it skips night sessions, so one extension knows another. Better: night excludes extensions that need someone to answer.
- The switch rides on the model settings and the `models` topic. An `extensions` topic with each one's state and errors would be its home.
- The server half is still imported when off, only not registered. The browser half truly never loads.

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
