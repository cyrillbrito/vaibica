# Extensions

How you could extend Bica without changing its code, on the agent side and in the UI. Nothing here is built, except that Bica's own tools and prompt are already Pi Durable extensions.

## Goals

- Anything is reachable: an extension can add to any part of Bica, wrap it, or replace it. Bica's own features use the same slots and services, so the API can't fall behind the app (JupyterLab's model).
- Extensions use what Bica uses: TypeScript, Solid, Tailwind, npm packages, the real DOM. No iframes and no sandbox, since one person writes or reviews them.
- A bad extension can't lock you out. A crash stays in its slot, the built-in takes over, and a safe mode starts with none.
- On the agent side, Pi Durable owns the concepts. An extension is a Durable extension, and Durable's docs are the extension docs.
- Config lives in `~/.bica/extensions/` and a project's `.bica/extensions/`, never in `~/.pi/`.

The test is whether these could be built: a custom file tree, another version control system with the Git panel on top, a different voice mode, and a game in the centre view.

## The agent half

Pi Durable's extensions already cover most of it: tools (a same-name tool replaces the built-in), prompt sections, hooks (`beforeTool` blocks or rewrites a call, `afterTool` replaces a result, `beforeRequest` rewrites messages, `onYield` continues a run, `beforeCompact` supplies its own summary), wraps around a tool or section, durable tasks, and documents for state. `registry.install()` under a used name replaces an extension live, which is hot reload. Owned conversations are Durable's subagents.

Bica's tools and its prompt sections are built this way already (`src/server/agent/harness.ts`, `src/server/profiles/instructions.ts`).

What Bica would add:

- A loader: import each file or folder in the extensions folders, call a default-export function with a host object, wrap its tools with Bica's timing and summary wrappers, and install it after the built-ins and before `harness.resume()`, so pending extension tasks find their code. Watch the folders, call an optional `dispose` export, and reinstall on change. `BICA_SAFE=1` loads none.
- A small host object for what Durable doesn't hand to extensions: `models`, `askFast`, and the harness as an escape hatch.
- Trust for project extensions: nothing in a repo's `.bica/extensions/` loads until you trust the project, recorded outside the repo. Worktrees share their project's trust and load from its main folder.
- Per-session selection with `configure({ extensions })`, so a project's extensions only run in its sessions.

Gaps in Durable, worth raising upstream instead of patching: hooks can't write (append a context edit or a steer), no way to run a tool through the hooks like Pi's `ctx.executeTool`, no tool exposure or annotations, hook model spend isn't counted, no lifecycle for cleanup, and `beforeCompact` can't pick the cut point.

### Test cases

- RTK, compressing command output: `beforeTool` rewrites `git status` into `rtk git status`.
- A guard on `.env` or `git push --force`: `beforeTool` returns `block`.
- Lint after an edit: `afterTool` adds `diagnostics`.
- "Keep going until the tests pass": `onYield` returns `continue`, with a memo as a loop guard.
- A cheaper compaction: `beforeCompact` summarizes with the fast model.
- A todo list: a tool, a rewindable document, and a section that re-renders the list, so it survives compaction.
- A subagent: a tool that owns a child conversation. Bica leaves hidden subagents out on purpose ([tools.md](../tools.md)), but as an extension it is your choice, and its row can show the child's transcript.

Approval before a call ("ask me first") has no clean path: Durable can't suspend a tool waiting on input.

## The UI half

Obsidian's model on Solid: plain code in named places, with every registration undone when the extension unloads. Two ideas come from elsewhere: built-ins use the same API (JupyterLab), and a built-in piece can be wrapped or replaced through a `next()` chain, falling back to the built-in on error (Claude Code mods).

- Slots are named places: `sidebar.section`, `center.view`, `rightPanel.tab`, `codeView` by file type, `transcript.tool` by tool name, `composer`, `topbar.action`. Bica's own Files tab would be the entry `files` in `rightPanel.tab`.
- Services sit behind features, such as a `vcs` service with git as its first provider.
- The client half is a `client.tsx`. The server compiles it with Solid's compiler and Tailwind, serves it as `/ext/<name>.js` and `.css`, and the browser loads it with `import()`. Extensions share Bica's Solid through `window.__bica`, or signals don't connect, like Obsidian's `require('obsidian')`.

```tsx
export default (bica) => {
  bica.slot('rightPanel.tab').add({ id: 'todos', title: 'Todos', component: Todos });
  bica.slot('rightPanel.tab').replace('files', MyTree);
  bica.slot('transcript.tool').wrap('bash', (props, Default) => <Fancy><Default {...props} /></Fancy>);
};
```

Not taken: VS Code's separate process and webviews, which can't change the app's own look; Raycast's and Zed's data-only APIs; and patching internals like Vencord, which breaks on every update.

## Order

1. The loader for `~/.bica/extensions/`, server only.
2. RTK and the cheaper compaction, one hook each, to prove the loader and a shared copy of Durable.
3. Tool row conventions in `details` (`markdown`, `conversationId`), then `transcript.tool` renderers. Tool rows are stable whatever the layout becomes.
4. Project extensions with trust, once a project wants one.
5. Other UI slots, once the layout settles.

## Sources

- Pi Durable: `node_modules/@earendil-works/pi-durable/README.md`, and Pi's extension API in `pi-coding-agent/docs/extensions.md`.
- Obsidian: [Plugin API](https://docs.obsidian.md/Reference/TypeScript+API/Plugin), [obsidian.d.ts](https://github.com/obsidianmd/obsidian-api).
- JupyterLab: [extension points](https://jupyterlab.readthedocs.io/en/latest/extension/extension_points.html).
- VS Code: [contribution points](https://code.visualstudio.com/api/references/contribution-points).
- Claude Code mods: [interface](https://code.claude.com/docs/en/plugins/mods/interface).
- RTK's Claude Code and Pi hooks, and Claude Code's hook usage (`PreToolUse`, `PostToolUse`, `Stop`, `PreCompact`) as a census of what people build.
