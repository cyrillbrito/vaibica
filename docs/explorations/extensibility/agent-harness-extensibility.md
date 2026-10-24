# Agent harness extensibility: what others do, and what Pi Durable already gives Bica

Research for turning Bica into a lean core where most features are extensions. It reads `docs/explorations/extensions.md` as the existing plan and focuses on what that plan misses or gets wrong. Each system section says how it works, what Bica should borrow, what to avoid, and where it came from. The ranked list of ideas is at the end.

Snapshot dates: Pi Durable 1.3.0 as installed in the repo (2026-10-15), and the web docs of each system as fetched in late October 2026. Several of these APIs change monthly.

## Contents

1. What the existing plan gets right, wrong, and misses
2. Pi Durable today: exactly what an extension can do
3. Pi coding agent
4. oh-my-pi (OMP)
5. Claude Code: plugins, hooks, mods, subagents, permissions
6. opencode: v1 plugins and the v2 plugin API
7. Codex, Amp, Goose, Cline, Roo Code, Continue
8. UI extension systems worth copying (Backstage)
9. Ordering, priority, and composition compared
10. Profiles as agents
11. Permissions and approval
12. Providers: can pi-ai replace CLIProxyAPI?
13. Testing the extension surface, and evals
14. Answers to the open questions in the notes
15. Ranked ideas to borrow, with cost
16. Sources

## 1. What the existing plan gets right, wrong, and misses

The plan's core bet is right: on the agent side, an extension is a Pi Durable extension, and Bica's own tools and prompt are already built that way (`src/server/agent/harness.ts`, `src/server/profiles/registry.ts`). The UI half (Obsidian-style named slots, built-ins on the same API, `next()` wrapping) matches what Claude Code mods and Backstage do. Safe mode and project trust are what every serious harness has.

Parts that are out of date with Durable 1.2 and 1.3:

- "No way to run a tool through the hooks like Pi's `ctx.executeTool`": tools can now call tools with `api.executeTool()`, as nested calls that run validation, the `ToolTask` hooks, output limits, and replay policy. Hooks still can't.
- "No tool exposure": Durable now has `callers` (`model`, `tools`, or both), per-conversation `modelTools`, and `deferred` tools with a `tool_search` extension. What's still missing is annotations (read-only, destructive, open-world), which Pi's coding agent and OMP use for approval.
- "Approval before a call has no clean path: Durable can't suspend a tool waiting on input": half wrong. `beforeTool` may return a promise and wait as long as it likes. It runs in the tool task's `call` phase, before the intent is committed, so after a restart the phase reruns and the hook runs again. If the answer is stored in a document, the rerun finds it. The cost is that the run stays busy while it waits, which is also how Claude Code, OMP, and Amp behave. Details in section 11.

What the plan doesn't cover, roughly in order of how soon it will hurt:

- Composition rules. Durable already defines them per hook (first `block` wins, arguments chain, `afterTool` chains, first `continue` wins), in the order of the conversation's selected extensions. The plan never says this, so an extension author can't predict what two guards or two result rewriters do together. Section 9.
- One enable state. OMP ended up with three disable mechanisms (settings booleans, `disabledExtensions`, `enabled: false` in `mcp.json`) and a bug where one toggle wrote two of them. Bica needs one place that says what is on, per scope, before there are many extensions.
- How the two halves of one extension talk. The plan has `client.tsx` loaded with `import()`, but no server-to-client data path. Bica already has the right one: the socket's requests and topics. opencode v2 ships exactly this split (`server`, `tui`, `rpc` entry points). Section 6.
- Where extension state lives. Durable documents cover conversation state; nothing covers global or per-project state, or files. Claude Code gives each plugin a data folder and a key-value store; opencode gives a scoped key-value store with prefix scans. Section 14.
- Profiles. The plan doesn't say whether coding, assistant, night, and hub are extensions or core. Every other harness treats an "agent" as a data bundle (model, tools, prompt, permissions, skills), and Durable already stores that bundle per conversation as `pi.agent`. Section 10.
- The prompt cache. Turning an extension on or off mid-session changes tools and sections. Durable sends only changed sections, but a tool set change can still cost a cache rewrite on some providers. Claude Code makes `/reload-plugins` refuse without `--force` when it would invalidate the cache.
- Failure budgets. A slow `beforeTool` blocks every tool call. OMP gives handlers a 30-second budget and fails closed on `tool_call`; Claude Code mods distinguish failures before and after `next()`. Durable reports and skips a throwing hook, except `beforeTool`, where a throw blocks the call.
- Continuation loops. `onYield` with `continue` can loop. Amp stops after five chained plugin continuations; Claude Code passes `stop_hook_active` to Stop hooks. The plan's "memo as a loop guard" is per extension; a global cap belongs in the core.
- Testing and evals. Nothing in the plan. Section 13.
- Device-independent dialogs. Pi's coding agent, Amp, and Claude Code all moved extension UI toward declarative requests (confirm, select, input) that any client can draw. Bica is remote-first, so an extension that needs the user should post a durable card, like `ask`, not draw a component on whichever tab happens to be open.

## 2. Pi Durable today: exactly what an extension can do

Source: `node_modules/@earendil-works/pi-durable/README.md`, `CHANGELOG.md`, and `dist/harness/types.d.ts` in the repo.

An extension is a plain object installed in a registry the process owns:

```ts
interface Extension {
  name: string;
  tools?: ToolRegistration[];
  sections?: PromptSection[];
  hooks?: HookRegistration[];   // hook(GenerationTask | ToolTask | CompactionTask, {...})
  wraps?: Wrap[];               // decorate a tool or section by name, where selected, in order
  tasks?: AnyTask[];            // durable state machines, resolved by name for every task
}
```

What each part can do:

| Part | Can | Can't |
| --- | --- | --- |
| `tools` | Run with a typed TypeBox schema, stream output, return `output` (model), `structuredOutput` (programs), `details` (UI), `usage`, `control: { terminate, handoff, addTools }`. Call other tools with `api.executeTool()`. Own child conversations (subagents) and child tasks. Declare `replay: "safe"`, `callers`, `deferred`. Replace a same-name tool from an earlier extension. | Carry annotations (read-only, destructive). Unregister themselves; you uninstall the whole extension. |
| `sections` | Render prompt text per request from the resolved agent, the env, and committed documents. Only changed sections are re-sent, which keeps the cache warm. | Know about each other's output. Order is the selected extensions' order. |
| `hooks` on `GenerationTask` | `beforeRequest` replaces one request's messages; `afterResponse` observes; `onYield` continues the run with a user message; `afterTools` observes a finished round. | Write anything: `HookApi` is read-only documents plus memos. No steer, no context edit, no entry. |
| `hooks` on `ToolTask` | `beforeTool` blocks or rewrites arguments, for model and nested calls (sees `call.parent`); `afterTool` replaces the result. | Ask for "ask the user" as a first-class outcome. |
| `hooks` on `CompactionTask` | `beforeCompact` declines or supplies the summary. | Choose the cut point. |
| `wraps` | Decorate whichever tool or section won, by name (Bica's timing and summary wrappers). | Wrap a hook. |
| `tasks` | Durable phases with checkpoints, child tasks, waiting with `allSettled` or `failFast`, bottom-up abort, `abandonOnRestart`. Pending tasks resume once their extension is installed again. | Run without their extension installed; they wait. |
| documents | `defineDoc({ kind, scope, history: "latest" or "rewindable", fork: "initial" or "current" or "asOf" })`, changed in atomic commits with entries, watched like the transcript. | Be written from a hook. |

Hook composition, read from `dist/harness/tool.js` and the type comments:

- Hooks run in the conversation's selected extension order (`runtime.hooks.each`).
- `beforeTool`: the first `block` wins and stops the rest; otherwise each hook sees the arguments the previous one returned. A throw blocks the call.
- `afterTool`: chained; each sees the previous result.
- `onYield`: the first `continue` wins.
- `beforeCompact`: the first decision wins.
- Any other hook that throws is reported through `onReport` and skipped.

Registry and selection:

- `registry.install(ext)` with a used name replaces it live. Work that already started keeps the code it took; the next phase, request, or call uses the new code. That is hot reload.
- `registry.uninstall(ext)` removes by name. Conversations store names, so a stored name outlives its code and just stops applying until reinstalled.
- `settings.extensions` is the default selection; absent, every installed extension in install order. `conversation.configure({ extensions: { add, remove } | [...] })` edits it per conversation, together with `model`, `thinkingLevel`, `tools`, `modelTools`, `instructions`, and `cwd`. A fork keeps the agent as of its fork entry; a task-owned child starts as a copy of its owner's.
- `HookApi.models` and `ToolExecutionApi.models` (1.1) give hooks and tools the harness's model catalog and credentials. Spend from hooks isn't counted in `pi.usage`; tool spend is, if the tool returns `usage`.
- `HarnessOptions.conversationCreated(tx, conversation)` runs in every commit that creates or forks a conversation, so an extension's documents can be seeded everywhere.
- SQLite storage takes a table `prefix` (1.3), so Bica can keep its own tables in the same database file, in the same transactions if it uses the same adapter.

Limits that matter for an extension platform:

- No lifecycle: no `start`, `stop`, or `dispose`. Watchers, servers, and timers an extension starts need Bica's loader to stop them.
- No hook writes, no hook-initiated tool calls, no hook spend accounting.
- No priorities. Order is selection order and nothing else.
- No route-the-model hook. Pi's coding agent has virtual models with a `route()` per request; Durable doesn't.
- No tool annotations.
- The registry is process-wide. Per-conversation selection is the only scoping, which is fine for project extensions as long as their code is trusted.

Upstream asks worth filing, updated from the plan's list: hook writes (append an entry, a context edit, or a steer at the boundary), hooks that call tools, tool annotations, an "ask" outcome or a documented "await in `beforeTool`" pattern, hook spend in `pi.usage`, a model `route` hook with the failed attempt (for fallbacks), and `beforeCompact` choosing the cut.

## 3. Pi coding agent

Source: `packages/coding-agent/docs/extensions.md`, `packages.md`, `virtual-models.md`, `security.md`, `rpc-extension-ui.md`, and `examples/extensions/`. Bica never runs this code, but Durable's API is its sibling, so its ideas port almost one to one.

How it works:

```ts
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && /\brm\s+-rf/.test(event.input.command)) {
      if (!ctx.hasUI) return { block: true, reason: "No UI to confirm" };
      if (!(await ctx.ui.confirm("Dangerous!", "Allow rm -rf?"))) return { block: true, reason: "Blocked by user" };
    }
  });
  pi.registerTool({ name: "greet", parameters: Type.Object({ name: Type.String() }), execute: async (id, p) => ({ content: [{ type: "text", text: `Hi ${p.name}` }], details: {} }) });
  pi.registerCommand("hello", { handler: async (args, ctx) => ctx.ui.notify("Hello!", "info") });
}
```

- A default-exported factory gets `ExtensionAPI`. It registers tools, commands, shortcuts, flags, providers, MCP servers, virtual models, and renderers, and subscribes to events with `pi.on()`, which returns an unsubscribe function.
- Events cover input (`input`, `before_agent_start`), runs and turns, the provider call (`context`, `context_with_system`, `before_provider_headers`, `before_provider_request`, `after_provider_response`, `provider_stream_event`), messages, tools (`tool_call`, `tool_result`, plus execution start, update, end), settlement (`agent_before_settle`, `agent_settled`), sessions (`session_start`, `session_shutdown`, `session_before_fork`, ...), and `project_trust`.
- Handlers run in extension load and registration order. The docs name each event's composition pattern: notification, in-place mutation, chained transformation, gate, actionable boundary, last override. Gate handlers should fail closed; a `tool_call` handler that throws blocks the tool.
- `turn_end` and `agent_before_settle` are "actionable boundaries": handlers can chain proposed entries (`custom`, `context_edit`, `compaction`) and `continue: true` for one more request. This is the hook-write capability Durable lacks.
- Tools have `exposure` (`direct`, `model-only`, `codemode`, `deferred`, `hidden`), `namespace`, and MCP-style `annotations`. The docs show a permission extension that confirms exactly the calls Codex would ask about, from annotations alone.
- `pi.registerToolRenderer((toolName, next) => renderers)` resolves renderers through a `next()` chain in load order, so `next() ?? mine` only fills gaps.
- State has four homes: tool `details` (follows the branch), `pi.appendEntry()` (durable, not in context), `pi.sendMessage()` (in context), external storage.
- Inter-extension communication is `pi.events`, an untyped string-keyed bus.
- `ctx.ui` has dialogs (`select`, `confirm`, `input`, `editor`), fire-and-forget calls (`notify`, `setStatus`, `setWidget`), and TUI components (`custom`, `setEditorComponent`, `setFooter`). In RPC mode only the declarative ones cross the wire, as `extension_ui_request` and `extension_ui_response` with ids and optional timeouts; the TUI ones are no-ops.
- Lifecycle rules: no processes, sockets, watchers, or timers in the factory, since some invocations load extensions without a session. Start them on `session_start`, stop them idempotently on `session_shutdown`.
- Virtual models: `pi.registerVirtualModel({ provider, id, route(request, ctx) })` picks a physical model per request. `request.reason` is `user`, `continuation`, `retry`, or `direct`; on `retry` it carries `failed` with the error message; `route()` can return `state`, stored on the branch. This is the cleanest fallback and routing design found.
- Packages bundle extensions, skills, prompts, and themes. `pi install npm:…|git:…|./local`, pinned versions, per-resource filters with globs and `!` exclusions, and host packages (`pi-ai`, `pi-coding-agent`, `typebox`) as `peerDependencies` so there is one copy. Project packages load only after project trust; trust decisions live outside the repo in `~/.pi/agent/trust.json`, and user extensions can decide trust with the `project_trust` event.
- Presets (`examples/extensions/preset.ts`) are profiles built as an extension: named bundles of provider, model, thinking level, tools, and instructions, switched with `/preset`.

Borrow:

- The composition table: name each hook point's pattern in the docs and make the code match.
- Annotations on tools, and approval driven by them.
- Declarative, id-matched UI requests for the server half, so any device can answer.
- The lifecycle rule: registration only in the factory, resources in start and stop.
- Virtual models with `reason` and `failed`, for fallbacks (section 12).
- Host packages as peers, so one copy of Durable and one copy of Solid.

Avoid:

- The untyped `pi.events` bus as the main way extensions talk. It gives no discoverability and no types.
- TUI-only UI calls that silently do nothing elsewhere. In Bica every surface is a browser, but the phone and the laptop are different layouts.

## 4. oh-my-pi (OMP)

Source: `can1357/oh-my-pi` README and `docs/` (`extensions.md`, `extension-loading.md`, `hooks.md`, `approval-mode.md`, `settings.md`, `models.md`, `non-compaction-retry-policy.md`, `task-agent-discovery.md`), and issues #1262 and #8346.

What it is: a hard fork of Pi by Can Bölük (Stencil Labs), "batteries included": 31 built-in tools (LSP, a debugger, a browser, desktop control, Python and JS kernels, GitHub, image generation, TTS, memory), about 80k lines of Rust natives, 60+ providers, subagents, plan mode, an advisor model that watches turns, approval modes, model roles with fallback chains, credential rotation across accounts, and discovery of `.claude`, `.cursor`, `.codex`, and other tools' config.

How features are structured:

- The extension API is Pi's (same `ExtensionAPI`, events, tools, commands, renderers) plus additions: `ctx.invokeTool`, file write and delete fallbacks, `before_subagent_spawn` for routing, `ctx.runEphemeralTurn`, timers, and terminal launching.
- Almost every headline feature is core code gated by a settings key, not an extension: `lsp.enabled`, `browser.enabled`, `computer.enabled`, `bash.enabled`, `plan.enabled`, `advisor.enabled`, `memory.backend`, `exa.enabled`, `secrets.enabled`, `autolearn.enabled`, and so on. The settings reference is about 1,100 lines.
- Extensions, hooks, custom tools, skills, rules, commands, prompts, and MCP servers are separate discovery subsystems. A package can carry all of them in conventional folders (`skills/`, `commands/`, `rules/`, `hooks/pre`, `hooks/post`, `tools/`, `.mcp.json`).
- A plugin package can declare `omp.features`, each with `default: true|false`, and installs pick features with brackets: `omp plugin install 'github:user/pkg[rules-guard]'`, changed later with `omp plugin features`.
- Enable and disable: `--no-extensions` (explicit-only), `--trusted-extension <abs path>` (exact allowlist, fail on load error), `disabledExtensions: [extension-module:<name>]`, per-tool booleans, and `enabled` in `mcp.json`. Issue #1262 shows one MCP toggle writing to two places; the maintainer's bot closed it noting "residual architectural fragmentation across three disable mechanisms remains". Issue #8346 asks for config parity with CLI-only isolation flags.
- Load order: modules are imported concurrently, then factories run sequentially in path order. Discovery providers are priority-sorted, and duplicates are deduped first-wins by capability key. Handlers have a 30-second budget, `tool_call` fails closed, `session_shutdown` handlers run concurrently with a 2-second budget.
- Composition is spelled out per event: `tool_call` keeps every distinct `additionalContext`, last input wins, first block short-circuits; `tool_result` merges per field so a later details-only return never erases an earlier redaction; `context` chains.

On the impression that "with so many extensions it looks like total slop, but if everything is off it is almost raw Pi": the docs support the second half and explain the first. Turning OMP's features off gives close to Pi's behavior because each feature is a branch behind a setting, not because it is unloaded. The code, the settings surface, and the interactions between features are all still there, so the product feels heavy even when most of it is off, and every new feature adds one more key and one more place to disable things. The lesson for Bica is the opposite structure: a feature that can be off should be a separate unit that isn't loaded, with one enable state, so "off" means less code running and less surface to read.

Borrow:

- `features` inside one package, so a bundle of related extensions installs once and toggles per feature.
- Per-event composition rules written down, including per-field merging of result rewrites.
- Handler time budgets and fail-closed gates.
- An exact allowlist mode for debugging (`--trusted-extension`), next to safe mode.
- Approval tiers on tools (section 11) and fallback chains plus credential rotation (section 12), as ideas, not code.

Avoid:

- Features as core branches behind booleans.
- Several disable mechanisms. One enable state, one writer.
- Array settings that replace instead of merge across scopes; OMP's docs call it "the most common surprise".
- Discovering other tools' config by default. Bica already refuses to borrow other apps' logins; the same logic applies to their rules and plugins.

## 5. Claude Code: plugins, hooks, mods, subagents, permissions

Source: code.claude.com docs: plugins reference, plugin marketplaces, discover plugins, hooks, sub-agents, permissions, output styles, and the mods pages (overview, interface, events, API, create, test).

### Plugins and marketplaces

A plugin is a folder, with an optional `.claude-plugin/plugin.json`:

```text
my-plugin/
├── .claude-plugin/plugin.json   # name, version, dependencies, userConfig, component paths
├── skills/  commands/  agents/  workflows/  output-styles/  themes/
├── hooks/hooks.json             # settings hooks, or "modules" for mods
├── monitors/monitors.json       # background commands whose stdout lines notify Claude
├── bin/                         # added to the Bash tool's PATH while enabled
├── settings.json  .mcp.json  .lsp.json
```

- Components are namespaced by plugin name (`plugin-dev:agent-creator`).
- `userConfig` declares typed options Claude Code asks for on enable, with `sensitive` ones kept out of settings files.
- `${CLAUDE_PLUGIN_ROOT}` is the plugin's cached copy; `${CLAUDE_PLUGIN_DATA}` is a data folder per plugin that outlives versions and is deleted on the last uninstall, after asking.
- `dependencies` name other plugins with semver ranges.
- Installs are copied into a versioned cache; Node dependencies install with a frozen lockfile and `--ignore-scripts`. Old versions are swept 14 days later so running sessions keep working.
- Scopes: user, project (written to `.claude/settings.json`), local, and managed. `enabledPlugins` in settings is the on and off state; disabling a project plugin for yourself writes an override to `settings.local.json`.
- Marketplaces are a `marketplace.json` listing plugins with sources (`github`, `git-subdir`, `npm`, `archive`, `command`), pinned by `ref` or `sha`.
- `/reload-plugins` applies changes without a restart, but refuses without `--force` when the reload would invalidate the prompt cache.
- Plugin subagents ignore `hooks`, `mcpServers`, and `permissionMode` in their frontmatter, for security.

### Settings hooks

- Events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `WorktreeCreate`, `FileChanged`, `CwdChanged`, `InstructionsLoaded`, `ConfigChange`, and more.
- Handler types: `command` (stdin JSON, exit codes), `http`, `mcp_tool`, `prompt` (a model answers JSON), `agent` (a subagent with read tools decides).
- Matching hooks run in parallel. Identical handlers from several settings files run once.
- `PreToolUse` can return `permissionDecision` (`allow`, `deny`, `ask`, `defer`) and `updatedInput`; `PostToolUse` can return `updatedToolOutput`; several events take `additionalContext`, and all values from all hooks are delivered.
- Deny rules beat hook allows: "PreToolUse hook decisions don't bypass permission rules."

### Mods (in-process plugins)

Mods are the newer, in-process kind, and the closest thing to what Bica's UI half wants:

```js
export function register(on) {
  on('tool.call', async ($, e, next) => { calls += 1; $.ui.invalidate('ui.render'); return next(e) })
  on('ui.render', { component: 'Spinner' }, async ($, e, next) =>
    next({ ...e, props: { ...e.props, suffix: ` · tool calls: ${calls}…` } }))
}
```

- Every event is a middleware chain. `next(e)` calls the next mod's hook and, at the end, Claude Code's own behavior. A hook can observe, rewrite, or answer in place.
- Order: built-in security guard and organization prepends first, then mods you install, then organization appends, then other built-ins. "Among the mods you install, a mod runs before the mods it lists under `dependencies`." Within a module, registration order. The first mod is outermost.
- Failure: a hook that throws, times out, or returns a bad shape is skipped if it hadn't called `next`, and its result stands if it had. `.catch(handler)` with `next.called` lets a guard fail closed.
- The hooks module has no Node APIs, timers, network, or file access. Everything goes through `$` (`$.fs`, `$.process`, `$.http`, `$.store`, `$.ui`, `$.session.send`), written in full at each call, so `claude plugin validate` can list a mod's events and calls before you install it.
- UI: render sites such as `Pane`, the band above the prompt, `Spinner`, `ToolUse`, `ToolResult`, `AskUserQuestion`, and messages. A hook returns an element tree or `next(e)`; `next` can take changed props, so a mod can adjust Claude Code's own drawing without replacing it. Mods draw in the terminal, the Desktop app, and VS Code from the same tree.
- Tests: `claude plugin test` runs files under `tests/` with no session, sign-in, or network. A test fires events (`$.tool.call(...)`, `$.command.run(...)`), stubs `$.store` or model calls with `on(...)`, advances fake timers, and mounts render sites with `$.ui.mount()` to press buttons and read the drawing.

### Subagents and output styles

- A subagent is a Markdown file with frontmatter: `name`, `description`, `tools`, `disallowedTools`, `model` (or `inherit`), `permissionMode`, `mcpServers`, `hooks`, `maxTurns`, `skills` (preloaded in full), `memory`, `effort`, `background`, `isolation: worktree`, `initialPrompt`. Managed beats project beats user; plugins add theirs.
- An output style is a Markdown file of instructions that replaces the coding section of the system prompt unless `keep-coding-instructions: true`. A plugin style can force itself with `force-for-plugin`, first loaded wins.

Borrow:

- The middleware chain with `next()` for UI slots and for wrapping built-in behavior, with failure semantics keyed on whether `next` was called. The plan already has `next()` for UI; extend it to the rule set.
- Order by origin first (core guards, then user, then project), then "runs before its dependencies", then registration order. No numeric priorities.
- A data folder and a key-value store per extension, deleted on uninstall after asking.
- `userConfig` with typed, sensitive fields, so extension settings render in Settings without custom UI.
- Refusing a reload that would break the prompt cache unless forced.
- `plugin test`: fire events, stub the store and models, mount a slot, press, assert. This is the testing story Bica lacks.
- Agent files as data (section 10).

Avoid:

- Shell-command hooks as the main mechanism. They exist for portability across languages and for enterprise policy; Bica is one TypeScript process.
- Restricting the module to a `$` API so it can be statically listed. It buys auditability for a marketplace of strangers. Bica's extensions are written or reviewed by one person; full Node and DOM access is the right trade, as the plan says.
- Five overlapping concepts (hooks, mods, monitors, workflows, output styles). Each was added for a reason, but Bica can fold most into "an extension with tools, sections, hooks, and slots".

## 6. opencode: v1 plugins and the v2 plugin API

Source: opencode.ai docs (plugins, custom tools, agents, permissions) and `packages/plugin/src` on the `dev` branch of `anomalyco/opencode`.

### v1, as documented

```ts
export const EnvProtection: Plugin = async ({ project, client, $, directory, worktree }) => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool === "read" && output.args.filePath.includes(".env")) throw new Error("Do not read .env files")
  },
  tool: { mytool: tool({ description: "…", args: { foo: tool.schema.string() }, execute: async (a) => a.foo }) },
})
```

- A plugin is a function that gets context (an SDK `client` for the opencode server, Bun's `$`, the project and worktree) and returns a hooks object. Hooks mutate an `output` object in place.
- Events cover sessions, messages, files, LSP, permissions (`permission.asked`, `permission.replied`), shell env, tools, and TUI (`tui.prompt.append`, `tui.toast.show`).
- Load order: global config, project config, global plugin folder, project plugin folder. All hooks run in sequence. npm plugins install with Bun at startup.
- A custom tool with a built-in's name replaces it.
- `experimental.session.compacting` lets a plugin push context into the compaction prompt.

### v2, in the source

The new API (`@opencode/plugin`) is a bigger idea and worth reading in full:

```ts
export default Plugin.define({
  id: "example",
  setup: async (ctx) => {
    await ctx.agent.transform((agent) => agent.update("reviewer", (a) => { a.mode = "subagent" }))
    await ctx.session.hook("retry", (e) => { if (e.attempt >= 3) e.decision = { retry: false } })
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)            // cleanup on unload or replace
  },
})
```

- Transform hooks contribute to stateful domains through an editor: `ctx.agent`, `command`, `integration`, `mcp`, `model`, `provider`, `reference`, `skill`, `tool`, `vcs`, `websearch`. Each domain's value is computed by running every enabled plugin's transforms in order, and `ctx.<domain>.reload()` reruns them when a plugin's source data changes.
- Runtime hooks intercept live operations: `session.hook("context" | "prompt" | "compaction" | "title" | "retry" | ...)`, `aisdk.hook("sdk" | "language")`, `permission.hook("evaluate")`.
- Every registration returns `{ dispose }`, and `setup` may return a cleanup function.
- A plugin package resolves up to three entry points: `server`, `tui`, and `rpc`. `ctx.rpc.register(definition, handlers)` exposes typed methods and events from the server half, and the TUI half calls them.
- `ctx.storage` is a scoped key-value store with `get`, `set`, `remove`, and `scan({ prefix, after, limit })`.
- `ctx.permission.assert({ sessionID, action, resources })` evaluates rules and, if needed, asks the user and waits; a tool calls it before doing something risky.
- Agents (`mode: primary | subagent`) are data with `model`, `prompt`, `permission`, `temperature`, defined in JSON or Markdown, and tool access is expressed as permissions (the old `tools` booleans are deprecated). Permission rules are `allow | ask | deny` per key with glob objects, last match wins, agent rules over global.

Borrow:

- Transform plus reload for registries that are lists: tools, agents, commands, models, slots. Disabling an extension then means recomputing without it, with no undo code. This fits Durable, which already resolves the agent by name at every use.
- `setup` returning cleanup, and `dispose` on every registration. The plan's optional `dispose` export is weaker: it can't undo half a setup.
- Three entry points per package (`server`, `client`, `rpc` or shared types), and a typed RPC definition shared by both halves. In Bica the RPC is the existing socket: an extension registers `requests` and `topics` under its own namespace.
- `permission.assert()` callable from inside a tool, next to rule-based checks in a hook.
- Tool access as permissions per agent, not a separate tools list.

Avoid:

- In-place mutation of shared `output` objects (v1). Order bugs are invisible. v2 moved to editors and explicit decisions for a reason.
- Effect-based APIs. opencode ships a Promise twin of the Effect API; Bica should only have the Promise one.

## 7. Codex, Amp, Goose, Cline, Roo Code, Continue

### Codex

Source: developers.openai.com/codex (hooks, config reference, advanced config, permissions, subagents, customization, plugins).

- Hooks in `hooks.json` or inline `[hooks]` in `config.toml`, Claude Code's shape: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SessionStart`, `SubagentStart`, `SubagentStop`, `Stop`, `SessionEnd`. Matching command hooks launch concurrently, "so one hook can't prevent another matching hook from starting". Project hooks load only when the project `.codex/` layer is trusted, and non-managed command hooks must be reviewed and trusted before they run.
- Permissions are two axes: `approval_policy` (`untrusted`, `on-request`, `never`, or `granular` per prompt category) and `sandbox_mode` (`read-only`, `workspace-write` with `writable_roots` and `network_access`, `danger-full-access`). `approvals_reviewer = "auto_review"` routes approvals to an automatic reviewer with a policy text.
- Profiles are whole config layers: `$CODEX_HOME/<name>.config.toml`, chosen with `--profile`. Project config can't override providers, auth, notifications, or profiles.
- Custom agents are TOML files under `.codex/agents/` with `name`, `description`, `developer_instructions`, optional `model` and `model_reasoning_effort`; other settings (sandbox, MCP servers, skills) inherit from the parent. The docs admit this "can feel heavier than a dedicated agent manifest".
- Skills can declare MCP dependencies in `agents/openai.yaml`; plugins package skills and MCP servers with a marketplace file.

Borrow: the two-axis split (what may run without asking, and what a run can reach), and "an agent inherits everything it doesn't set". Avoid: config-layer files as agents; Codex's own docs call them heavy.

### Amp

Source: ampcode.com/docs/customize/plugins, ampcode.com/permissions, ampcode.com/news/toolboxes.

```ts
export default function (amp: PluginAPI) {
  amp.on('tool.call', async (event, ctx) =>
    (await ctx.ui.confirm({ title: `Allow ${event.tool}?` }))
      ? { action: 'allow' }
      : { action: 'reject-and-continue', message: `The user rejected ${event.tool}.` })
  amp.on('agent.end', (event) => needsTests(event) ? { action: 'continue', userMessage: '[plugin:tests] Run the tests.' } : undefined)
}
```

- Plugins add tools, commands, skills, and event handlers. `tool.call` returns `allow`, `reject-and-continue`, `modify`, or `synthesize` (answer without running the tool). `agent.end` can `continue`; Amp stops chaining plugin continuations after five in a row unless the result raises `maxContinuations`.
- `ctx.tools.call(name, input)` calls built-in, plugin, and MCP tools. `amp.ai.ask` (yes or no with reasoning) and `amp.ai.decide` (typed decisions from a decision model) are first-class, the same idea as Bica's decision model.
- Plugin UI is dialogs only (`notify`, `confirm`, `input`, `select`, with fields, files, images, links), "mirrored across TUI and Web surfaces".
- Personal and workspace plugins live in git repositories; Amp edits them in a thread, commits, asks before pushing, and reloads the plugin without a restart.
- Permissions are an ordered rule list (`ask Bash --cmd '*rm*rf*'`, `allow '*'`), first match wins.
- Toolboxes: any executable in `$AMP_TOOLBOX` is a tool; `TOOLBOX_ACTION=describe` prints its schema, `execute` runs it with arguments on stdin.

Borrow: `synthesize` as a fourth `beforeTool` outcome; a global continuation cap; dialogs that render the same on every surface; "ask the agent to write and reload the extension" as the authoring loop. The toolbox protocol is a cheap way to accept tools in any language.

### Goose

Source: goose-docs.ai and `block/goose` docs.

- Extensions are MCP servers, plus built-in "platform" extensions (for example `summon`, which provides subagent `delegate` and `load` tools). An allowlist URL (`GOOSE_ALLOWLIST`) restricts which extensions can be installed.
- Recipes are YAML bundles of instructions, extensions, settings, and sub-recipes; a subagent can run a recipe and gets only the extensions it lists.
- Permission modes: autonomous (default), manual approval, smart approval (the model classifies read versus write tools), chat only. Per-tool `always_allow`, `ask`, `always_deny`.
- Subagents can't spawn subagents or manage extensions.

Borrow: recipes as the shareable unit for "a profile plus a starting prompt"; subagents that can't change their parent's extensions. Avoid: MCP as the only extension mechanism, since it can't hook the loop.

### Cline

Source: docs.cline.bot (SDK plugins, writing plugins, auto approve).

- SDK plugins are objects with `name`, a `manifest` of capabilities, `setup(api)` that registers tools, and `hooks` (`beforeRun`, `beforeTool`, `afterRun`, ...).
- Auto approve is per category (read project files, read all files, edit project files, edit all files, safe commands, all commands, browser, MCP). The model marks each command `requires_approval`; there is no fixed allowlist. YOLO approves everything.

Borrow: approval by category with an inside-or-outside-the-workspace split, which is simpler than per-tool rules. Avoid: letting the model decide whether its own command needs approval.

### Roo Code

Source: docs.roocode.com/features/custom-modes.

- A mode is `slug`, `name`, `description`, `roleDefinition` (start of the prompt), `whenToUse` (for the orchestrator), `customInstructions` (end of the prompt), and `groups`: tool groups `read`, `edit`, `command`, `mcp`, where `edit` can carry `fileRegex` ("only Markdown files").
- Project modes override global ones by slug.

Borrow: `whenToUse` separate from the UI description, which is what the hub needs to pick a profile; `fileRegex` on edit as a cheap restriction for a docs-only or tests-only profile.

### Continue

Source: docs.continue.dev/reference.

- An "agent" is a `config.yaml` of `models` (each with `roles`: chat, edit, apply, autocomplete, embed, rerank, summarize), `rules`, `prompts`, `context` providers, `docs`, and `mcpServers`. Hub blocks are referenced with `uses:` and pinned versions.

Borrow: model roles, which Bica already has as default, fast, and decision models; naming them "roles" and letting a profile override a role is cleaner than one-off settings. Avoid: one config file as the whole agent; it doesn't compose.

## 8. UI extension systems worth copying (Backstage)

The plan cites Obsidian, JupyterLab, VS Code, and Claude Code mods. Backstage's new frontend system answers two of the open questions better than any of them: parent and child relations, and enable, disable, and order.

Source: backstage.io/docs/frontend-system/architecture (extensions, extension overrides).

- Every UI extension has an id (`kind:namespace/name`), an attachment point (`attachTo: { id: parent, input: name }`), typed outputs, and typed inputs. Data flows one way, from child to parent, through typed "extension data references" such as `coreExtensionData.reactElement`.
- The app is a tree. A child can only attach to an input whose data types it provides. An integrator can move an extension to another parent in config.
- Any extension can be disabled; a disabled one is not instantiated and its parent doesn't see it. Extensions can be disabled by default, and "when an extension is toggled from disabled to enabled through configuration it resets the ordering of the extension, pushing it to the end", so order of enabling in config decides UI order.
- `extension.override({ factory(original, { inputs, config }) {...} })` wraps the original, can reorder, filter, or wrap its inputs, and can add config fields.
- Each extension declares a config schema with defaults; configs replace, they never merge.

Borrow for Bica's UI half:

- Slots as typed inputs of a parent extension, not a global list of names. `rightPanel` is an extension with an input `tabs`; the Files tab is a child attached to it. A third party can add a tab, move one, or disable one by id.
- Disabled-by-default plus order-of-enabling as the ordering rule for UI lists. No `priority: 100` numbers.
- Overrides that receive the original factory, which is the plan's `wrap` with access to children.

Avoid: Backstage's blueprint layer and Zod-everywhere config. Bica needs ids, attachment, enable, and override; not a plugin SDK for teams.

## 9. Ordering, priority, and composition compared

| System | Order between extensions | Composition when several handle one point | Failure |
| --- | --- | --- | --- |
| Pi Durable | Selected extensions' order per conversation | `beforeTool` first block wins, args chain; `afterTool` chains; `onYield` first continue; `beforeCompact` first decision | Throwing hook reported and skipped; `beforeTool` throw blocks |
| Pi coding agent | Load and registration order | Named per event: notify, mutate, chain, gate, boundary, last override | Reported; `tool_call` throw blocks |
| OMP | Path order; discovery priority with first-wins dedupe | Per event; `tool_result` merges per field | 30 s budget; `tool_call` fails closed |
| Claude Code settings hooks | None; matching hooks run in parallel | All `additionalContext` kept; deny rules beat hook allows | Exit 2 blocks |
| Claude Code mods | Origin layers, then "before its dependencies", then registration | Middleware chain with `next()`; first is outermost | Skip if `next` not called, keep result if it was; `.catch` to fail closed |
| Codex hooks | None; concurrent | Each hook independent | Unsupported fields mark the hook failed |
| opencode v1 | Config source order | Sequential, mutate `output` in place | Throw blocks the tool |
| opencode v2 | Plugin order | Transforms in order over an editor; runtime hooks set a decision field | Cleanup on unload |
| Amp | Name precedence: project, system, personal, workspace | Not documented beyond first decision | Continuation cap of five |
| Backstage UI | Order of enabling in config | Tree; parent decides how to use children | Disabled children vanish |

What Bica should do:

- Keep Durable's order rule (selection order) and make the loader produce a deterministic selection: core guards first, then built-in features, then user extensions, then project extensions, each layer in a stored order the user can change by dragging in Settings. That is Claude Code's origin layering and Backstage's order-of-enabling, with no numbers.
- Allow one relation, `before: ["x"]` or "runs before its dependencies", only when a real case needs it. Every system that added numeric priorities (VS Code's menu `order`, WordPress) ended with arms races.
- Publish a table of hook points with their composition rule, and pick deny-first for gates: a guard that says no can't be overruled by a later yes. Durable's first-block-wins already gives that.
- Merge result rewrites per field (OMP), or make a redaction set a flag later hooks can't clear.

## 10. Profiles as agents

Every harness converges on the same bundle:

| System | Name | Fields |
| --- | --- | --- |
| Claude Code | subagent, `--agent` | model, effort, tools, disallowedTools, permissionMode, skills, mcpServers, hooks, memory, isolation, initialPrompt, prompt body |
| opencode | agent (`primary` or `subagent`) | model, prompt, permission, temperature, description |
| Codex | custom agent, profile | developer_instructions, model, effort, plus any config key; inherits the rest |
| OMP | task agent | systemPrompt, tools, spawns, prioritized model list, thinkingLevel, output schema, autoloadSkills, advisor, prewalk |
| Roo | mode | roleDefinition, whenToUse, customInstructions, tool groups with fileRegex |
| Goose | recipe | instructions, extensions, settings, sub-recipes |
| Pi coding agent | preset (an example extension) | provider, model, thinkingLevel, tools, instructions |
| Pi Durable | `pi.agent` document | model, thinkingLevel, extensions, tools, modelTools, instructions, cwd |

Bica's four profiles are this bundle plus behavior: the hub has its own tools and a project list section, the night profile has a scheduler, the assistant profile has memory in files, and coding is the default.

Recommendation: split the bundle from the behavior.

- The bundle is core data: an agent file with frontmatter and a prompt body, mapping one to one onto `configure()` (`model`, `thinkingLevel`, `extensions`, `tools`, `modelTools`, `instructions`), plus Bica fields (`description`, `whenToUse` for the hub, `skills`, `permissions` once approval exists). Core owns loading, validation, the picker, and per-session switching. This costs little because Durable already stores and resolves exactly this per conversation.
- The behavior is extensions: the hub's session tools, night runs' scheduler, assistant memory, voice. An agent file selects them by name.
- Extensions can contribute agent files, as Claude Code plugins, OMP packages, and opencode's `agent.transform` do. A "night runs" extension ships the `night` agent and the scheduler together.
- Inheritance follows Codex: an agent sets what it changes and inherits the rest from the default.

Making profiles an extension instead (Pi's preset approach) works in Pi only because Pi's core has no agent concept. Durable has one, so a profile extension would wrap a core feature for no gain.

## 11. Permissions and approval

How each harness does it:

- Claude Code: rules `allow | ask | deny` with tool and argument patterns (`Bash(git push *)`), evaluated deny, then ask, then allow; modes (`default`, `acceptEdits`, `plan`, `auto` with a classifier, `dontAsk`, `bypassPermissions`); `PreToolUse` hooks can deny, ask, allow, or defer but can't override deny rules; a `PermissionRequest` hook can answer for the user and persist rules.
- Codex: `approval_policy` times `sandbox_mode`, a granular policy per prompt category, and an optional automatic reviewer.
- opencode: `permission` keys per tool or tool family, glob objects, last match wins, per-agent overrides; "always" approvals use patterns the tool suggests (a safe command prefix); `doom_loop` asks when the same call repeats three times.
- OMP: each tool declares a tier (`read`, `write`, `exec`) and may force a prompt (`override`) for critical patterns; modes `always-ask`, `always-ask-cached` (grants per file and folder, optionally remembered in a database), `write`, `yolo` (default); user `tools.approval.<tool>` rules. Approval is re-resolved after extensions rewrite the input. Typing a message while an approval waits denies it and steers the turn with that message.
- Pi coding agent: no built-in approval; `permission-gate.ts` and the annotations example show it as an extension.
- Amp: an ordered rule list, first match wins, plus plugins answering `tool.call`.
- Goose: modes plus per-tool always, ask, never; "smart approval" lets the model classify.
- Cline: per-category toggles, with the model flagging risky commands.

What Bica can build on Durable today, as an extension:

```ts
const Approvals = defineDoc<{ [taskId: string]: "allow" | "deny" }>({ kind: "ext.approval.decisions", version: 1, scope: "conversation", history: "latest", fork: "initial", initial: () => ({}) });

hook(ToolTask, {
  beforeTool: async (call, api, ctx) => {
    if (!needsApproval(call)) return;                                    // tier table, rules, or annotations
    const saved = (await api.snapshot(Approvals, api.conversationId, ctx))?.[api.taskId];
    const answer = saved ?? (await waitForAnswer(api.taskId, call, ctx)); // Bica-side promise, resolved by a socket request
    return answer === "allow" ? undefined : { block: "The user declined this call." };
  },
});
```

- The hook runs before intent is recorded, so a restart reruns it and finds the stored answer. The card is drawn from the document and from `pi.live`, so it shows on every device and survives reloads, like `ask`.
- Esc aborts the task, and `runtime.signal` ends the wait.
- Steers queue behind the waiting round. OMP's "deny and steer" is a good UX: sending a message while an approval waits declines it and delivers the message.
- Tiers need data Durable doesn't have yet. Keep a Bica-side table keyed by tool name (read, write, exec, plus "outside the worktree") until annotations land upstream; the codemode tool's nested calls carry `call.parent`, so approval can apply to what a script does, not just to `codemode` itself.
- Deny-first: a guard extension's block must win over an approval extension's allow, which Durable's first-block-wins already guarantees if guards are selected first.

Cost: medium. The hard parts are the rule language and the UI, not Durable.

## 12. Providers: can pi-ai replace CLIProxyAPI?

What Bica does today (`docs/providers.md` and `docs/proxy.md` in the repo): one sign-in or key per provider in `.data/auth.json`, plus a CLIProxyAPI server that holds many plan sign-ins, picks by priority (timed plans first, token-billed work accounts next, OpenRouter last), keeps a conversation on one account for its cache, can serve every machine over Tailscale, and exposes each account's rate-limit headers for the usage meters. Voice calls use the ChatGPT sign-in or go through the proxy.

What pi-ai gives, from its README and `dist/models.d.ts`:

- A `Provider` is a plain object (`id`, `auth`, `getModels`, `stream`, `streamSimple`, optional `generateImages`, `classify`). `createModels()` routes each request to the provider that owns the model, and `models.setProvider()` works at any time, so a provider can be added by an extension after startup.
- The `CredentialStore` holds one type-tagged credential per provider id. OAuth refresh runs inside `modify(providerId)`, serialized, so two requests never double-refresh. A stored credential owns its provider; env keys are only consulted when nothing is stored.
- `onResponse(response)` gives status and headers for each request, which is where rate-limit and usage headers live. `onProviderStreamEvent` exposes raw stream events.
- Image models (`type: "image"`) and classifier models live in the same catalog and use the same credential. There is no realtime or voice API; Bica's `src/server/voice.ts` speaks the Codex realtime protocol itself.
- No fallback, rotation, or routing. Pi's coding agent has virtual models with `route()` and `failed` on retry, but that lives in the coding agent, not in pi-ai or Durable. OMP added `auth.accountPolicies`, credential rotation, `retry.fallbackChains`, `retry.fallbackOn: usage-limit`, and usage-aware account choice, in its own fork of pi-ai.

So pi-ai can replace the proxy, but only with code Bica writes:

- Several accounts per provider: wrap a built-in provider under another id (`anthropic@work`), delegating `stream` and `auth`, with the models rewritten to the new provider id. The credential store then keeps one credential per wrapper. A few dozen lines per provider family, and sign-in flows work unchanged because they are keyed by provider id.
- A pool with fallback: a virtual provider whose `stream()` picks an account by the conversation's `sessionId` (Durable forwards a stable UUID per conversation, which gives the same affinity the proxy gives), and on a 429 or usage-limit error before the first content event tries the next account by the same priority rules. `onResponse` headers fill the usage meters. Model fallback (another model, not just another account) loses the prompt cache and changes behavior, so it should be opt-in per pool, as OMP's `fallbackOn` is.
- Usage rules ("spend timed plans first, keep 10% in reserve"): OMP's `usageReservePct` and `usageReservePolicy: confirm | auto | fail-closed` are the reference.
- Image models: pi-ai already covers them per provider credential.
- Voice: stays outside pi-ai; a voice extension owns its transport and borrows a credential through `models.getAuth()`.

What the proxy still gives that this doesn't: one pool shared by several machines, Copilot through its community fork, and isolation of the "pose as Claude Code" risk in a separate binary. Recommendation: keep the proxy; build the pool as an extension (a pi-ai `Provider` registered on load) only when one of the proxy's costs bites, for example a machine without the proxy running. It is a good first "provider extension", because it needs no hook Durable lacks.

## 13. Testing the extension surface, and evals

How harness authors test extensions:

- Claude Code: `claude plugin test` runs a plugin's own tests with no session or network; tests fire events, stub `$.store` and model calls, advance fake timers, and mount render sites to press buttons and read the drawing. `claude plugin validate` lists each mod's events and API calls statically.
- Pi: pi-ai's `fauxProvider()` scripts assistant messages, thinking, and tool calls, with simulated streaming, usage, and prompt cache. Pi's examples include `overlay-qa-tests.ts` and `rpc-demo.ts`, which exercise every RPC UI method against a client.
- Pi Durable: `@earendil-works/pi-durable/testing` exports conformance suites for storage and environments (`registerStorageConformance`, `registerEnvConformance`) that any Vitest- or Jest-like runner can run, and its examples cover reload mid-call and restarts (`31-reload-and-restart.ts`, `13-recovery.ts`).
- OMP: `omp plugin doctor`, structured load errors per path, and an exact allowlist mode to isolate one extension.

An extension conformance suite for Bica, on Durable's own tools (MemoryStorage, the faux provider, Bun's test runner, which the repo already uses for `test:bun`):

- Install, run a turn, uninstall mid-run, reinstall: the transcript stays valid, and pending tasks of the extension wait and then resume.
- Restart while a hook waits and while a tool runs: replay-safe tools rerun, others report `interrupted`, an approval hook asks again or finds its stored answer.
- Fork and compact: the extension's documents follow its `fork` and `history` policy, and its sections still render.
- Disable for one conversation with `configure()`: no sections, tools, or hooks of it apply from the next request.
- Two copies of a guard and a rewriter selected in both orders: the composition table holds.
- A hook that throws, and one that hangs past its budget.
- For a client half: mount its slot with stubbed topics, click, assert, then `agent-browser` on `?data=worst` as for any UI change.

Evals for the agent loop:

- Terminal-Bench 2.0 is the common benchmark for terminal agents, run through Harbor (`harbor run --dataset terminal-bench@2.0 --agent <name>`), which can run any agent that installs into a container. Leaderboard entries are model and harness pairs.
- "How good is your harness?" (ICML 2026) separates model and harness effects on Terminal-Bench 2.0 and finds the harness matters about as much as the model, with effects that differ by model. A re-sort of the Terminal-Bench 2.1 leaderboard found 0.2 to 8.1 point gaps for the same model across harnesses, with a ±1.2 to 1.7 point margin of error, so gaps under about 3 points mean nothing.
- For Bica, a headless entry (open a Harness on MemoryStorage with an agent file, run one prompt, exit) is enough to wrap as a Harbor agent. Then extension sets can be A/B tested on a fixed task subset with several attempts each: RTK on or off, codemode on or off, a compaction extension. Treat these numbers with the same care as anyone's benchmark.

## 14. Answers to the open questions in the notes

How extensions communicate:

- Shared state goes through Durable documents (conversation scope) and Bica's own store (global and project scope). One writer per document kind, prefixed with the owner's id (`ext.<id>.*`); others read it.
- Calls go through typed services: an extension `provides` a named service object and another `consumes` it, resolved by the loader at setup, as JupyterLab tokens and Backstage data refs do. The `vcs` service in the plan is one.
- Events are a last resort, typed by a shared definition, like opencode's RPC definitions. Pi's untyped bus is the cautionary example.
- Server to client is the existing socket: an extension registers requests and topics under `ext.<id>.`, and its client half subscribes with the same snapshot, changes, cache, and reconnect rules as everything else.

Order and priority: section 9. Layers by origin, a stored order inside each layer, deny-first gates, and no numbers.

Dependencies: two kinds, and keep them apart. A runtime requirement ("needs the `vcs` service") is checked at load and disables the extension with a clear message if unmet. A UI parent ("attaches to `rightPanel.tabs`") is Backstage's attachment point; a missing parent hides the child. Avoid version ranges between extensions until there are extensions by other people.

Extension-owned state and data: conversation state in Durable documents with explicit `fork` and `history`; global state in a key-value table per extension in Bica's SQLite, using Durable 1.3's table `prefix` so it can share the database; files in `~/.bica/extensions-data/<id>/`, deleted on uninstall after asking (Claude Code's model).

Dynamic loading of UI components: the plan's approach holds (compile `client.tsx` with Solid's compiler and Tailwind, serve it, `import()` it, share Solid through one global). Two additions: cache-bust the URL by content hash, since the browser and Bun both cache by specifier; and load client halves only for enabled extensions, after the shell renders, so a broken one can't block the page.

Testing the extension surface: section 13.

Ensuring stability of a lean core: the core is the harness, the socket, the loader, the enable state, agent files, and the slot tree. Everything with a toggle in Settings today is a candidate extension, moved one at a time, each move landing with its conformance tests. The core must run with zero extensions (safe mode) and still show sessions, the composer, and the extension list.

## 15. Ranked ideas to borrow, with cost

1. One extension unit and one enable state. A manifest next to the Durable extension (`id`, `defaultEnabled`, `features`, `requires`, `userConfig`), a loader that builds the selection in layers (core guards, built-ins, user, project) with a stored order per layer, and one store of what is on per scope. Move built-ins behind it one by one, starting with the ones that already are Durable extensions (web tools, terminal tools, ask, codemode). From OMP's three-mechanism lesson, Claude Code's `enabledPlugins` and scopes, and Backstage's enable order. Cost: medium, a loader of a few hundred lines plus one settings screen; each later move is small.
2. A published composition table for every hook point and slot, deny-first for gates, per-field merge for result rewrites, a handler time budget, and a global continuation cap. From Pi's composition patterns, OMP's per-event rules, Claude Code mods' failure semantics, and Amp's cap. Cost: small; mostly docs plus a thin wrapper around Durable's hooks for budgets and the cap.
3. Agent files as core data mapping onto `configure()`, with `whenToUse` for the hub, inheritance from the default agent, and extensions able to ship agent files. Profiles' behavior moves into extensions. From Claude Code subagents, opencode agents, Codex custom agents, Roo modes. Cost: small to medium, since Durable already stores the bundle.
4. Approval as an extension: an awaiting `beforeTool` backed by a decisions document and a durable card, tool tiers in a Bica table until annotations exist, "deny and steer". From OMP's approval modes, Pi's annotations example, Claude Code's deny-first rules, opencode's `permission.assert`. Cost: medium.
5. Two-half extensions over the existing socket: `server` registers `ext.<id>.` requests and topics, `client` mounts into typed slots that are inputs of parent extensions. From opencode v2's `server`, `tui`, `rpc` entry points and Backstage's extension tree. Cost: medium to large; do it after the agent half.
6. Setup returns cleanup, and every registration returns `dispose`, so disable and hot reload undo exactly what was done. Durable's registry replace covers the agent side; this covers watchers, timers, socket handlers, and slots. From opencode v2 and Pi's lifecycle rules. Cost: small.
7. An extension conformance suite on MemoryStorage and the faux provider (install and uninstall mid-run, restart mid-hook, fork, compact, disable, two orders), plus a way to run an extension's own tests. From Claude Code's `plugin test` and Durable's conformance suites. Cost: medium once, then free per extension.
8. Extension state homes: Durable documents with `ext.<id>.` kinds for conversation state, a key-value table per extension in the same SQLite file through Durable's table prefix, and a data folder deleted on uninstall. From Claude Code's plugin data and `$.store`, opencode's storage domain. Cost: small.
9. A provider pool as the first provider extension: accounts as wrapped providers, affinity by Durable's per-conversation session id, fallback on usage limits before the first token, limits read from `onResponse` headers. Only when the proxy's costs bite. From Pi's virtual models and OMP's account policies. Cost: medium to large.
10. A Harbor adapter for headless Bica, to A/B extension sets on a Terminal-Bench subset with several attempts per task. From Terminal-Bench, Harbor, and the ICML harness paper. Cost: large in tokens and setup; worth it only once there are extension choices to settle.

## 16. Sources

Pi Durable and pi-ai (installed copies):

- `node_modules/@earendil-works/pi-durable/README.md`, `CHANGELOG.md`, `dist/harness/types.d.ts`, `dist/harness/tool.js`
- `node_modules/@earendil-works/pi-ai/README.md`, `dist/models.d.ts`, `dist/types.d.ts`
- Bica: `docs/explorations/extensions.md`, `docs/providers.md`, `docs/proxy.md`, `docs/realtime-communication.md`, `src/server/agent/harness.ts`, `src/server/profiles/registry.ts`, `src/server/agent/tools/ask.ts`

Pi coding agent:

- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/virtual-models.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc-extension-ui.md
- https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions (`permission-gate.ts`, `preset.ts`, `event-bus.ts`)

oh-my-pi:

- https://github.com/can1357/oh-my-pi and https://omp.sh
- https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md, `extension-loading.md`, `hooks.md`, `approval-mode.md`, `settings.md`, `models.md`, `non-compaction-retry-policy.md`, `task-agent-discovery.md`
- https://github.com/can1357/oh-my-pi/issues/1262, https://github.com/can1357/oh-my-pi/issues/8346
- https://github.com/rblaine95/omp-plugins (`omp.features`)
- https://kunavo.com/guides/oh-my-pi-vs-pi

Claude Code:

- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/discover-plugins
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/output-styles
- https://code.claude.com/docs/en/plugins/mods, `/mods/interface`, `/mods/events`, `/mods/api`, `/mods/create`, `/mods/test`

opencode:

- https://opencode.ai/docs/plugins/, https://opencode.ai/docs/custom-tools/, https://opencode.ai/docs/agents/, https://opencode.ai/docs/permissions/
- https://github.com/anomalyco/opencode/tree/dev/packages/plugin/src (`README.md`, `host.ts`, `promise/plugin.ts`, `promise/rpc.ts`, `promise/storage.ts`, `promise/permission.ts`, `promise/session.ts`, `promise/registration.ts`)

Codex, Amp, Goose, Cline, Roo, Continue:

- https://developers.openai.com/codex/hooks, https://developers.openai.com/codex/config-advanced, https://developers.openai.com/codex/config-reference, https://developers.openai.com/codex/subagents, https://developers.openai.com/codex/concepts/customization
- https://ampcode.com/docs/customize/plugins, https://ampcode.com/permissions, https://ampcode.com/news/toolboxes
- https://goose-docs.ai/docs/guides/context-engineering/subagents/, https://goose-docs.ai/docs/guides/recipes/, https://github.com/block/goose/blob/main/documentation/docs/guides/goose-permissions.md
- https://docs.cline.bot/sdk/guides/writing-plugins.md, https://docs.cline.bot/features/auto-approve.md
- https://docs.roocode.com/features/custom-modes
- https://docs.continue.dev/reference

UI extension systems:

- https://backstage.io/docs/frontend-system/architecture/extensions
- https://backstage.io/docs/frontend-system/architecture/extension-overrides

Evals:

- https://github.com/harbor-framework/terminal-bench-2, https://github.com/harbor-framework/harbor, https://www.tbench.ai/news/announcement-2-0
- https://icml.cc/virtual/2026/68323 ("How good is your harness?")
- https://note.com/hacklog_stealth/n/n2b39609cef45 (same model, different harness, on the Terminal-Bench 2.1 leaderboard)
- https://dev.to/amariahak/atlarix-vs-opencode-on-terminal-bench-20-same-model-only-the-harness-changes-k1-receipts-54nk
