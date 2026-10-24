# Extensions

An extension is a feature Bica can switch off. Core runs sessions, and extensions add tools, prompt lines, settings, and transcript rows to them. Only built-in extensions exist, as plain code in `src/extensions/`: `ask` ([tools.md](./tools.md#asking-you)), web search ([tools.md](./tools.md#web-search)), and [terminals](./terminals.md). Where this is heading is in [extensibility.md](./explorations/extensibility.md).

## Switching one off

Settings → Extensions has one switch per extension, saved in `settings.json`, with the extension's settings under it while it's on. Off means its code isn't registered: the server doesn't install its Pi Durable extension, and the browser never loads its components. The `extensions` topic carries each one's switch and whether its settings are set, and `extension.update` changes them ([realtime-communication.md](./realtime-communication.md)).

A switch reaches every session at its next model request, even mid-run. Sessions list every extension that applies to them, on or off, and Pi Durable skips what isn't installed, so stored lists like the hub's follow the switch too. Past calls stay in the history. The model sees them as they were, a new call gets a `tool_unavailable` error, and the transcript draws them as plain tool rows. Changing the tools rebuilds the prompt cache once.

## How one is built

An extension is a folder in `src/extensions/` with three parts, each a plain object:

- `meta.ts` is the manifest: the id, a title and a line for Settings, whether it starts on, its tools and their traits that core acts on, and its settings. Both sides read it without loading the rest.
- `server.ts` holds its Durable extensions, which [agents](./agents.md) it applies to (all of them, none, or a list of its Durable extensions per agent), its lines in the prompt's tool list, and what a session waiting on it asks, for other agents. It reads its settings with `readSetting`, per use, so a change needs no restart. It also answers its own requests and topics, acts on core's hooks, and adds lines to the agents' `list`, all below.
- `client.ts` lists the slots it fills, its pages, and its commands, and how the generic tool row names its tools and which icon it draws. Each component loads lazily through `load()`.

`src/extensions/manifests.ts`, `server.ts`, and `client.ts` list the built-ins. The lists are keyed by id, so a missing half fails the type check. Their order is the order extensions take in every session: after the agent's own tools, before the folder's files and the reply rules. The types are in `src/extensions/contract.ts`.

## What core offers

Everything past `transcript.tool` and `settings` is provisional: terminals alone shaped it.

- Hooks, named after core's own events: `worktreeCreated` (a worktree was made for new work), `beforeWorktreeRemove` (its folder is still there), and `sessionArchived`. They run in every extension that is on, in order, and one that throws is logged and skipped.
- `inWorkspace` adds lines under a workspace in the agents' `list`, such as each terminal and whether the asking session started it.
- Requests and topics named `ext:<id>/<name>`. The extension types them in its folder, `calls` and `topics` on the server half answer them, and `reads` names the calls that run again when re-sent after a lost reply. The browser half sends them through `extensionSocket(id)`, typed, and names topics not worth saving on the device. While it's off, the server refuses them ([realtime-communication.md](./realtime-communication.md)).
- `transcript.tool` draws a tool's calls, and the generic tool row stands in while it's off or when it throws.
- `sidebar.workspace` lists rows in a workspace's group above its sessions, and adds entries to the workspace's menu. A workspace with rows stays out of Parked. Core draws each row in its list item, behind an error boundary.
- `palette.search` lists places ⌘K finds while you type, after sessions and workspaces.
- Pages live under `/e/<id>/`, one route core owns. The extension lists paths within its prefix, such as `:id`, and core draws the one that matches, or Page not found while it's off. A page calls `usePageWorkspace` so the right panel and ⌘K follow its workspace.
- Commands are a registry by id, as in VS Code and Obsidian: a title, an optional `when`, a shortcut, and `run`, which gets the page's workspace and a way to navigate. ⌘K lists the ones that apply under Actions, and `runCommand(id)` runs one from anywhere. Core's own ⌘K entries don't go through it yet.

A slot's `use` hook runs in the slot's own component scope, so it can read a topic or navigate. It runs once the switches are known, and again when they change, so an extension that's off never subscribes.

## Settings

A manifest declares its settings by key, and Settings draws a row for each under the switch. The only kind is a secret, such as web search's Exa key. A secret is saved in `auth.json` next to the provider keys, under its own key, and the browser learns only whether it's set and a long key's last characters.

## Rules

- Core never names an extension. A test fails when code outside `src/extensions` quotes an extension's id, tool names, setting keys, or Durable names, uses one as an object key, or sends its `ext:<id>/` requests; test data is exempt. Deleting an extension's folder and its line in the three lists removes it.
- Extensions import from core, never the other way.
- A hook core gains is named after a core concept, such as status or transcript rows, so another extension could use it. Pieces only one extension has shaped are marked provisional in `contract.ts` until a second one needs them.

## Sources

- Pi Durable's registry: selections store extension names, and an uninstalled one is skipped (`node_modules/@earendil-works/pi-durable/README.md`, Extensions and Per-Conversation Agent).
- AG Grid [modules](https://www.ag-grid.com/javascript-data-grid/modules/): one registered object per feature.
- VS Code's [extension manifest](https://code.visualstudio.com/api/references/extension-manifest): what can be read without running the code, settings included (`contributes.configuration`).
- Claude Desktop's [extensions](https://www.anthropic.com/engineering/desktop-extensions): `user_config` in the manifest, drawn as a form, with secrets kept apart from settings.
- JupyterLab: built-ins go through the same API as everything else.
- Grafana's [app plugins](https://grafana.com/developers/plugin-tools/key-concepts/plugin-types-usage) own every page under `/a/<plugin-id>/`, which is where `/e/<id>/` comes from.
- VS Code's [commands](https://code.visualstudio.com/api/extension-guides/command) and Obsidian's [`addCommand`](https://docs.obsidian.md/Plugins/User+interface/Commands): commands by id, with a condition, that anything can run.
- Backstage's [extensions](https://backstage.io/docs/frontend-system/architecture/extensions): a contribution is a record with an id, a target, and a lazy component.
