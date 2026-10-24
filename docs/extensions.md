# Extensions

An extension is a feature Bica can switch off. Core runs sessions, and extensions add tools, prompt lines, and transcript rows to them. Only built-in extensions exist, as plain code in `src/extensions/`, and `ask` is the first. Where this is heading is in [extensibility.md](./explorations/extensibility.md).

## Switching one off

Settings → Extensions has one switch per extension, saved in `settings.json`. Off means its code isn't registered: the server doesn't install its Pi Durable extension, and the browser never loads its components.

A switch reaches every session at its next model request, even mid-run. Sessions list every extension that applies to them, on or off, and Pi Durable skips what isn't installed, so stored lists like the hub's follow the switch too. Past calls stay in the history. The model sees them as they were, a new call gets a `tool_unavailable` error, and the transcript draws them as plain tool rows. Changing the tools rebuilds the prompt cache once.

## How one is built

An extension is a folder in `src/extensions/` with three parts, each a plain object:

- `meta.ts` is the manifest: the id, a title and a line for Settings, whether it starts on, and traits of its tools that core acts on. Both sides read it without loading the rest.
- `server.ts` holds its Durable extensions, which [agents](./agents.md) it applies to, its lines in the prompt's tool list, and what a session waiting on it asks, for other agents.
- `client.ts` lists the slots it fills, each with a lazy `load()`. `transcript.tool` draws a tool's calls, and the generic tool row stands in while it's off or when it throws.

`src/extensions/manifests.ts`, `server.ts`, and `client.ts` list the built-ins. The lists are keyed by id, so a missing half fails the type check. Their order is the order extensions take in every session: after the agent's own tools, before the folder's files and the reply rules. The types are in `src/extensions/contract.ts`.

## Rules

- Core never names an extension. `test:bun` fails when code outside `src/extensions` quotes an extension's id or tool names; test data is exempt. Deleting an extension's folder and its line in the three lists removes it.
- Extensions import from core, never the other way.
- A hook core gains is named after a core concept, such as status or transcript rows, so another extension could use it. Pieces only one extension has shaped are marked provisional in `contract.ts` until a second one needs them.

## Sources

- Pi Durable's registry: selections store extension names, and an uninstalled one is skipped (`node_modules/@earendil-works/pi-durable/README.md`, Extensions and Per-Conversation Agent).
- AG Grid [modules](https://www.ag-grid.com/javascript-data-grid/modules/): one registered object per feature.
- VS Code's [extension manifest](https://code.visualstudio.com/api/references/extension-manifest): what can be read without running the code.
- JupyterLab: built-ins go through the same API as everything else.
