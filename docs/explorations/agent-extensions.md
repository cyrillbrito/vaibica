# Agent extensions

This is exploration work and a plan. Nothing here is built. It looks at how people could extend what Bica's agent can do, through Pi Durable's own extensions, and sketches the smallest loader that would get there.

The short version: Pi Durable already has almost every agent-side hook Bica needs, and Bica's built-in tools are already Durable extensions. What's missing is a loader for `~/.bica/extensions/` and `.bica/extensions/`, a small host object for things Durable doesn't hand to extensions (models, the fast model), a way to draw an extension's tool calls, and a few fixes inside Bica so extensions reach every corner (the prompt is one string today, and codemode skips hooks). A handful of gaps sit in Durable itself and are worth raising upstream rather than patching around.

## Principles

- Pi Durable owns the concepts. Extensions, tools, sections, hooks, wraps, tasks, documents, and the registry are Durable's, and Bica uses them as they are. Bica doesn't add its own extension format, its own hook names, or a wrapper API around Durable's.
- Bica owns as little as it can: finding and loading files, a small host object, trust for project extensions, and drawing tool calls. When Durable changes, the extensions follow Durable's docs, not Bica's.
- Bica's own agent is built the same way. Its tools are already Durable extensions, and its system prompt becomes Durable sections too, so an extension can change anything Bica itself sets up.
- The system prompt stays simple. A few short sections (who Bica is, the rules, the project's AGENTS.md files, the skills, the folder, the reply rules), each one plain text that an extension can wrap or drop.
- When Durable lacks something, ask upstream before building it into Bica. A workaround in Bica is temporary and says so.

## Runtime

Bica's server runs on Bun, in development too, so loading `~/.bica/extensions/*.ts` is a plain `import()` with no build step. Extensions should still prefer `node:` modules and web APIs over `Bun.*`, so they stay easy to move.

## Scope

In scope is everything that changes what the model can do or how a run goes:

- Adding tools, and replacing or wrapping built-in ones.
- Adding, rewriting, or removing parts of the system prompt.
- Guarding or rewriting tool calls before they run, and rewriting results after.
- Saving tokens: compressing command output (RTK), pruning old context.
- Custom compaction.
- Continuing a run when the model stops too early.
- Subagents.
- How an extension's tool calls are drawn in the transcript, keyed by tool name.

Out of scope are the session list, the top bar, the right panel, the composer, and every other piece of UI around the chat. [extensions.md](./extensions.md) covers those.

The stance follows the author: lean on Pi Durable and don't wrap it. An extension file should be a Durable extension, written with Durable's own `defineExtension`, `defineTool`, `section`, `hook`, and `wrapTool`, so Durable's docs are the extension docs. Bica adds only what Durable can't know about. Configuration lives in `~/.bica/` and a project's `.bica/`, never in `~/.pi/`.

## What Pi Durable gives today

Everything below is in the installed `@earendil-works/pi-durable` (README, `dist/harness/types.d.ts`). An extension is a named bundle of five things:

- `tools`: model-callable tools with a TypeBox schema. A later extension's tool with the same name replaces an earlier one, so overriding `bash` or `read` is free.
- `sections`: system prompt sections, rendered in order before each request. A section sees the resolved agent, the environment (with its `cwd`), and committed documents. Durable sends only sections that changed, as positional system entries, so the prompt cache stays warm.
- `hooks` on the built-in tasks:
  - On generation: `beforeRequest` replaces the messages of one request, `afterResponse` observes each provider message, `onYield` can continue a run with another user message when the model gives its final answer, and `afterTools` observes a finished round.
  - On tools: `beforeTool` blocks a call or rewrites its arguments, and `afterTool` replaces its result.
  - On compaction: `beforeCompact` declines a compaction or supplies its own summary.
- `wraps`: decorators of a tool or a section by name (`wrapTool`, `wrapSection`), applied to whichever version won.
- `tasks`: durable state machines that checkpoint every step and resume after a crash, with child tasks, waiting, and abort that runs bottom-up.

Around that:

- Tool results can carry `diagnostics` (model-visible remarks such as lint errors), `usage` (spend of nested model calls), and `control`: `terminate` ends the run, `handoff` resets the context with a note, and `addTools` turns on more tools for later rounds.
- Documents (`defineDoc`) are typed JSON stored per conversation, per task, or per session. They're committed with the transcript, can be rewindable, and say what a fork inherits. This is where extension state goes.
- Entries can carry context `edits` that omit or replace earlier entries in what the model sees, durably. That's the clean base for context pruning.
- A tool can create conversations it owns and drive them (`api.conversation(id).submit`). That is Durable's subagent model. Owned work is aborted with its owner and keeps the owner busy, unless it sits under a `background` task.
- Each conversation stores which extensions and tools it selects (`configure({ extensions: { add, remove } })`), by name. Unset means the host default, `settings.extensions`, which may be a live getter. A subagent starts as a copy of its owner's choices.
- `registry.install(extension)` with an installed name replaces it in place, at once. Running work finishes on the code it started with, and the next phase uses the new code. That is hot reload, already built.
- After a restart, pending tasks of an extension's `tasks` resume once that extension is installed again.

The other packages matter less here. `pi-ai` is model access: Durable calls it, and an extension needs it only for its own model calls. `chord` is the document and watch layer under Durable. `pi-codemode` is the QuickJS sandbox behind Bica's `codemode` tool, with no Pi dependencies.

## How Bica uses it today

Bica's agent is already built from Durable extensions, installed in `src/server/harness.ts`:

- `CodingTools` (read, write, edit, bash), `TerminalTools`, the web tools, `SessionTools` (`session_start` and the other session tools, and `list`), `AskTool`, and `codemode`.
- Every tool goes through two Bica wrappers: `timeTools` stamps start and duration on `details` for the transcript, and `withSummary` adds the `summary` argument the transcript shows next to the tool name. Coding tools also get GitButler lane claiming and change tracking.
- `settings.extensions` is unset, so every session selects every installed extension.

Three things in today's code would get in an extension's way:

- The prompt is one string. `buildInstructions()` in `instructions.ts` joins the preamble, tools, rules, GitButler notes, AGENTS.md files, skills, cwd, and reply rules, and `sessions.ts` writes it into the conversation's `instructions` before each prompt. An extension can add sections, which render before it, but it can't rewrite or drop Bica's rules, because they aren't sections.
- Codemode skips hooks and wraps. `createCodemode()` makes only the tools of a fixed list callable, so extension tools can't be called from scripts. Nested calls run `tool.execute()` directly, so `beforeTool` and `afterTool` never see them. Nested bash doesn't even go through the bash tool, since `runBash` calls the environment directly. An RTK hook or a path guard would miss every command run from a script.
- `harness.resume()` runs right after `Harness.open()`. Extension tasks need their extensions installed before that, or their pending work waits blocked until a reload.

## Pi's extension API, mapped to Durable

The Pi coding agent's extension API (`pi-coding-agent/docs/extensions.md`) is the bar for openness. Most of its agent side has a Durable equivalent. Its UI side (commands, shortcuts, flags, `ctx.ui`, widgets, footers, themes) is Bica's to design and is out of scope here.

| Pi | Durable | Fit |
| --- | --- | --- |
| `registerTool` | `tools`, `defineTool` | Same |
| Overriding a built-in tool | A same-name tool in a later extension, or `wrapTool` | Same |
| `tool_call`: block or mutate input | `beforeTool` | Same |
| `tool_result`: replace result | `afterTool` | Same |
| `before_agent_start`: prompt sections and guidelines | `sections`, `wrapSection`, `instructions` | Same, once Bica's prompt is made of sections |
| `before_agent_start`: force the whole system prompt | Host sets `instructions` and drops the other sections | Host only |
| `context`: transform messages per request | `beforeRequest` | Same |
| `context_edit` entries | Entry `edits` | Durable has it, but hooks can't write it |
| `agent_before_settle`: continue once more | `onYield` returning `continue` | Same |
| `turn_end`: append entries and continue | `afterTools`, observe only | Missing |
| `message_end`: replace a finished message | `afterResponse`, observe only | Missing |
| `session_before_compact`: cancel or own summary | `beforeCompact`: decline or summary | Mostly. The cut point is Durable's. |
| `session_compact`, `session_compact_failed` | `pi.live.compactions` and the compaction entry, in the watched view | No hook, but observable |
| `appendEntry`, tool `details` for state | Documents, `write` entries without `model`, tool `details` | Better: documents fork and rewind |
| `sendUserMessage`, `sendMessage` | Host `conversation.submit` (input or write), tool `control.handoff` | Host only; hooks can't submit |
| `setActiveTools`, loader tools | `configure({ tools })`, `control.addTools` | Same |
| `setModel`, `setThinkingLevel` | `configure({ model, thinkingLevel })` | Same |
| Tool `exposure` (`model-only`, `codemode`, `deferred`), `tool_search` | None | Missing |
| Tool `annotations` (read-only, destructive) | None | Missing; extra fields on the tool object would do |
| `ctx.executeTool`: nested calls through the hooks | None | Missing |
| `ctx.modelRegistry` for nested model calls | None in hooks or tools | Missing; the host has `models` |
| `registerProvider`, virtual models | None; the host owns pi-ai `Models` | Host only |
| `before_provider_request`, headers, `provider_stream_event` | None; the host can wrap `Models`, as Bica already does for plan usage and thinking time | Host only |
| `registerMcpServer` | None; an extension can build tools from a server when it loads | Partial |
| `session_start`, `session_shutdown`, reload lifecycle | None; an extension is a plain object | Missing |
| `pi.events` between extensions | None; shared documents or plain imports | Partial |
| Subagent packages (`pi-subagents` and others) | Owned conversations, child tasks, background tasks | Better: durable, abortable, restart-safe |
| Nothing | Durable `tasks` | Durable only |
| `project_trust` | None | Host only |
| `registerToolRenderer`, `renderCall`, `renderResult` | None | Host UI: Bica's `transcript.tool` |
| Prompt templates, commands, `input` event | None | Host UI, out of scope |

## What's missing

Some gaps Bica can fill on its own, in a few lines each:

- Model access for extensions. Hooks and tools get no `Models`, so a custom compaction or a summarizing tool can't call a model. Bica passes a small host object with `models` and `askFast`.
- Codemode reaching extensions. Codemode should call every tool the agent offers except a short model-only list, and run nested calls through the selected extensions' `beforeTool` and `afterTool`. Hooks are plain data on `agent.extensions[].hooks`, so codemode can collect and call them itself.
- Bica's prompt as sections, so extensions can wrap or drop parts of it.
- Cleanup on reload. Durable has no lifecycle, so an extension that starts a process (an MCP server, a watcher) leaks it on every reload. An optional `dispose` export covers that.
- Trust for project extensions, which is Bica's to decide.

Others belong in Durable, and are worth asking for rather than working around:

- Hooks can't write. `HookApi` only reads documents and memos. An `afterTools` hook can't append a context edit, a note for the model, or a steer, and an `afterResponse` hook can't replace the message. Pi's `turn_end` and `message_end` can. Today the workaround is a tool, or Bica's server submitting a `write` from outside.
- No way to run a tool through the hooks, like Pi's `ctx.executeTool`. Every orchestrating tool (codemode, a batch tool) has to rebuild that path itself.
- No tool exposure or annotations. Tools are either offered to the model or not. Pi's `model-only`, `codemode`, and `deferred` matter once MCP tools arrive.
- Hook spend isn't counted. A `beforeCompact` summary made with another model can't report its `usage`, so `pi.usage` undercounts.
- Compaction keeps Durable's cut. `beforeCompact` can replace the summary but not choose `firstKept`, and `keepRecentTokens` is one setting for the whole harness.

## Test cases

Popular extensions from Pi, Claude Code, and RTK, checked against Durable. Claude Code's hooks are the best census of what people want: most hook setups use `PreToolUse` to block or rewrite and `PostToolUse` to lint or format, then `Stop`, `SessionStart`, and `PreCompact`.

- RTK compresses command output by rewriting `git status` into `rtk git status` before it runs. Its Claude Code and Pi integrations are both a pre-tool hook on bash. In Durable that's `beforeTool`. Without the binary, an `afterTool` can do lighter compression in plain TypeScript. Both miss codemode's bash until codemode runs hooks.
- A path or command guard (protected `.env`, no `git push --force`) is `beforeTool` returning `block`. It works. Asking you to approve instead of blocking needs UI, see the open questions.
- Lint or format after an edit is `afterTool` adding `diagnostics`. The model sees them, and the result stays the tool's own. It works.
- A quality gate, "keep going until the tests pass", is `onYield` returning `continue`, with a memo as a loop guard. It works.
- Context injected at the start of a session (open issues, recent commits) is a `section`. It works. The text should be computed once and kept in a document, because a section that changes on every request sends a new system entry each time.
- Preserving state across compaction is `beforeCompact` with its own summary, or a section that re-renders the state from a document after every compaction. Both work.
- Plan mode, a read-only phase, is a document plus `configure({ tools })`. Durable's example 27 builds it. It works.
- A todo list is a tool, a document, and a section, plus a renderer. It works, see the examples.
- Subagents, the most popular kind of Pi package, are owned conversations. Durable's examples 22 and 23 build a foreground and a background version. They work, and Bica needs a renderer that shows the child's transcript inside the call.
- Context pruning (dropping stale tool output, as `pi-agent-suite` does) works per request in `beforeRequest`. A durable version wants entry `edits`, which hooks can't write. Partial.
- An MCP adapter can build tools from a server when it loads. Without exposure and lifecycle, every tool is always declared and the server process leaks on reload. Partial.
- A custom model provider has no Durable path. The host would have to expose `models.setProvider`. Missing, and low priority.

## A loader for Bica

### Files

```
~/.bica/extensions/
  rtk.ts               one file: a server-only extension
  todo/
    index.ts           the Durable extension
    client.tsx         optional: renderers for its tools
    package.json       optional: its own npm dependencies
<project>/.bica/extensions/
  ...same shapes, loaded only for that project's sessions, once trusted
```

This matches Pi's layout: a file, or a folder with an `index.ts`.

### Module shape

The default export is a Durable extension, or a function that returns one. The function form receives the Bica host object.

```ts
import { defineExtension } from '@earendil-works/pi-durable';

export default defineExtension({ name: 'rtk', hooks: [/* ... */] });
// or
export default (bica: BicaHost) => defineExtension({ /* uses bica.askFast */ });

// Optional: called before a reload replaces this module, and on shutdown.
export function dispose() {}
```

The host object stays small and holds only what Durable doesn't give:

```ts
interface BicaHost {
  models: Models; // pi-ai, with Bica's credentials
  askFast(system: string, prompt: string, opts: { maxTokens: number }): Promise<string>;
  fastModel(): ModelRef | undefined;
  harness: Harness; // the escape hatch: anything Durable can do
}
```

Extensions import `@earendil-works/pi-durable`, `pi-ai`, and `typebox` directly. Bica's own server modules aren't importable, because the production build bundles them into `dist/server/`, so there are no stable paths to import from. The host object is the door into Bica.

### Loading without a rebuild

On Bun it is a plain `import()` with a version query, so a reload gets the new code. The import runs outside Vite's dev module runner, so dev and production load extensions the same way.

Extensions should get Bica's own copies of Durable, pi-ai, and TypeBox. Two copies of Durable would mostly still work, because Durable matches hooks, tasks, and documents by name, but one copy avoids surprises. That needs a check: `ToolTask` imported in an extension should be the same object as Bica's.

### Installing

1. Read `~/.bica/extensions/` and each trusted project's `.bica/extensions/`.
2. Import each one, call it with the host object if it's a function, and wrap its tools with `timeTools` and `withSummary`, like the built-ins, so their rows look the same in the transcript.
3. Prefix project extensions' names with the project (`<project>/lint`), so two repos can each have a `lint`. User extensions keep their own names.
4. `registry.install()` each one, after Bica's built-ins, so a same-name tool replaces Bica's.
5. Only then call `harness.resume()`, so pending extension tasks find their code.

A file that fails to import or throws keeps its previous version installed, and the error goes to the server log and, later, to Settings. `BICA_SAFE=1` starts with no extensions at all.

### Hot reload

`fs.watch(dir, { recursive: true })` on each extensions folder, debounced. On a change, the loader calls the old module's `dispose`, imports the file again with the module cache off, and installs it under the same name, which replaces it in place. A deleted file is uninstalled. Durable does the rest: running calls finish on the old code, and the next request or call uses the new code.

Tasks are the one sharp edge. A changed task definition with pending work needs a new `version` and a `migrate`, as Durable's tasks require.

### Selecting per session

- `settings.extensions` becomes a getter: Bica's built-ins plus the user's extensions, live. That's what every session selects by default.
- Project extensions aren't in the default, so a session in another project never runs them. When a session is created, and again on each submit (where `sessions.ts` already syncs the prompt), Bica adds the project's extensions with `configure({ extensions: { add } })`. A new project extension reaches running sessions the same way.
- Turning one off for one session is `configure({ extensions: { remove } })`. The stored choice is a change to the default, so later user extensions still arrive. The control for it (a menu in the composer) is UI for later.
- Subagents copy their owner's choices, so they get the same extensions unless the subagent tool removes some.

### Trusting project extensions

A project extension is code from a repo that runs with full access. Pi asks once per folder before loading any of them, and Bica should do the same:

- Nothing in a project's `.bica/extensions/` loads until the project is trusted.
- The project page says "This project has 2 extensions" with a Trust button. The decision lives in `~/.bica/trusted.json`, outside the repo, so the repo can't trust itself.
- Worktrees belong to their project, so they share its trust. Extensions load from the project's main folder, not from each worktree, so a branch can't swap in other code.
- Project extensions can wait. User extensions in `~/.bica/` cover the author's needs first, and they need no trust.

### Codemode

Codemode becomes an ordinary consumer of the registry instead of a fixed list:

- Scripts can call every tool the agent offers, except a model-only list: `ask`, `list`, the session tools, `codemode`, and whatever an extension adds there (for example `export const modelOnly = ['subagent']`).
- Every nested call runs the selected extensions' `beforeTool` and `afterTool`, collected from `agent.extensions[].hooks`. Nested bash applies the rewritten arguments too.

### Drawing extension tools in the transcript

There are two levels, and the first needs no client code at all.

Without a renderer, an extension tool already draws acceptably today. The row shows its name, the `summary`, a timer, and status, and the body shows the arguments as JSON and the output. A few `details` shapes the built-in row understands would cover most needs without any client code: `markdown` for a formatted body, `patch` for a diff (edits use it already), `sessionId` for a session link (`session_start` uses it already), and `conversationId` to embed a subagent's transcript.

With a renderer, an extension folder adds `client.tsx`:

```tsx
export const tools = {
  todo: (props: { call: ToolCall; Default: Component<{ call: ToolCall }> }) => <TodoList call={props.call} />,
};
```

- It draws only the body of the row. The header (icon, name, summary, timer, status) stays Bica's, so every row lines up. An optional `label` and icon can come later.
- `Default` is Bica's own body, so a renderer can wrap it instead of replacing it.
- In `ToolCalls.tsx`, `ToolBody` looks up a reactive map keyed by tool name before its built-in cases.
- Loading follows [extensions.md](./extensions.md): the server compiles `client.tsx` with Solid's compiler (`@solidjs/compiler` is already installed with the Vite plugin) and serves it as `/ext/<name>.js`. Solid and Bica's components reach it through `window.__bica`, so signals connect. On a change, the browser imports it again with a new hash and swaps the map entry, and open rows redraw.

Renderers are the first UI slot [extensions.md](./extensions.md) proposed, because tool rows are a stable idea whatever the layout becomes.

## Examples

These are sketches. They use Durable's API as installed, and Bica's host object as proposed above.

### RTK: compress command output

```ts
// ~/.bica/extensions/rtk.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineExtension, hook, ToolTask } from '@earendil-works/pi-durable';

const run = promisify(execFile);

// RTK's own rewrite rules, the ones its Claude Code and Pi hooks use.
async function rewrite(command: string) {
  try {
    const { stdout } = await run('rtk', ['rewrite', command], { timeout: 2000 });
    return stdout.trim() || undefined;
  } catch {
    return undefined; // no rtk installed, or nothing to rewrite
  }
}

export default defineExtension({
  name: 'rtk',
  hooks: [
    hook(ToolTask, {
      async beforeTool(call) {
        if (call.name !== 'bash') return;
        const command = await rewrite(String(call.arguments.command));
        if (command) return { arguments: { ...call.arguments, command } };
      },
    }),
  ],
});
```

The transcript still shows the command the model wrote, and the output is RTK's. A version without the binary uses `afterTool` instead: strip ANSI codes and progress lines, collapse repeats, and keep the head and tail of long output. It could keep the full text in `details` so you see everything while the model sees less. Until codemode runs hooks, commands from scripts aren't compressed.

### A cheaper compaction

```ts
// ~/.bica/extensions/cheap-compaction.ts
import { CompactionTask, defineExtension, hook } from '@earendil-works/pi-durable';
import type { Message } from '@earendil-works/pi-ai';

const PROMPT = `Summarize this coding session so work can continue from the summary alone.
Keep: the goal, decisions and why, files changed, commands that matter, open problems, next steps.`;

export default (bica: BicaHost) =>
  defineExtension({
    name: 'cheap-compaction',
    hooks: [
      hook(CompactionTask, {
        async beforeCompact({ messages, instructions }) {
          if (!bica.fastModel()) return; // Durable's own summary
          const summary = await bica.askFast(
            instructions ? `${PROMPT}\n\nAlso: ${instructions}` : PROMPT,
            transcript(messages),
            { maxTokens: 4000 },
          );
          return { summary };
        },
      }),
    ],
  });

// Plain text per message: role, text, tool calls with their arguments, and tool results cut short.
function transcript(messages: readonly Message[]): string { /* ... */ }
```

Durable still picks what to cut and what to keep verbatim, and it places the summary. A throw falls back to Durable's own summary. The fast model's spend isn't counted in the session's usage, since a hook can't report it.

### A todo list with its own renderer

```ts
// ~/.bica/extensions/todo/index.ts
import { Type } from '@earendil-works/pi-ai';
import { defineDoc, defineExtension, defineTool, section } from '@earendil-works/pi-durable';

type Item = { text: string; done: boolean };

// Rewindable and forked as of the fork point, so a fork keeps the list it had then.
const Todos = defineDoc<{ items: Item[] }>({
  kind: 'todo.list',
  version: 1,
  scope: 'conversation',
  history: 'rewindable',
  fork: 'asOf',
  initial: () => ({ items: [] }),
});

const todo = defineTool({
  name: 'todo',
  description: 'Replace your task list for this work. Keep it current: mark items done as you finish them.',
  parameters: Type.Object({
    items: Type.Array(Type.Object({ text: Type.String(), done: Type.Boolean() })),
  }),
  replay: 'safe',
  async execute({ items }, api, context) {
    await api.commit(async (tx) => {
      (await tx.doc(Todos, api.conversationId)).items = items;
    }, context);
    const open = items.filter((i) => !i.done).length;
    return { content: [{ type: 'text', text: `${open} open` }], details: { items } };
  },
});

export default defineExtension({
  name: 'todo',
  tools: [todo],
  // Re-rendered into the prompt, so the list survives compaction.
  sections: [
    section('todos', async ({ conversationId, read }, context) => {
      const list = await read.snapshot(Todos, conversationId, context);
      return list?.items.length
        ? list.items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')
        : undefined;
    }),
  ],
});
```

```tsx
// ~/.bica/extensions/todo/client.tsx
import { For } from 'solid-js';

export const tools = {
  todo: (props: { call: ToolCall }) => (
    <ul class="flex flex-col gap-1">
      <For each={(props.call.details as { items?: Item[] })?.items ?? []}>
        {(item) => <li class={item().done ? 'text-muted line-through' : 'text-fg'}>{item().text}</li>}
      </For>
    </ul>
  ),
};
```

The list changes only when the tool runs, so the section sends a new system entry only then.

### A subagent

Bica left hidden subagents out on purpose (see `docs/tools.md`): they cost tokens and hide their work. As an extension, they become a choice per user, and the renderer can show the child's work instead of hiding it.

```ts
// ~/.bica/extensions/subagent.ts
import { Type } from '@earendil-works/pi-ai';
import { AssistantEntry, configure, defineExtension, defineTool } from '@earendil-works/pi-durable';
import type { Extension } from '@earendil-works/pi-durable';

const Subagent: Extension = defineExtension({
  name: 'subagent',
  tools: [
    defineTool({
      name: 'subagent',
      description:
        'Hand a self-contained research task to a helper with a fresh context, and get its answer back. Use it to read a lot and report a little.',
      parameters: Type.Object({ task: Type.String({ description: 'The whole task; the helper sees nothing else' }) }),
      replay: 'safe', // a rerun after a crash finds the same child and submission
      async execute({ task }, api, context) {
        const child = await api.commit(async (tx) => {
          const existing = (await tx.scanConversations({ ownerTaskId: api.taskId }, 1)).items[0];
          if (existing) return existing.id;
          // Starts as a copy of this session's agent: model, extensions, tools, cwd.
          const created = await tx.createConversation({ ownership: { kind: 'task', taskId: api.taskId } });
          await configure(tx, created.id, { extensions: { remove: [Subagent] } }); // no grandchildren
          return created.id;
        }, context);
        await api.details({ conversationId: child }, context); // the renderer attaches here
        const handle = await api.conversation(child, context);
        const request = { type: 'input', content: task, requestId: `subagent:${api.taskId}` } as const;
        const settled = await (await handle!.submit(request, context)).wait(context);
        if (settled.status !== 'done' || settled.type !== 'input') throw new Error(`The helper stopped: ${settled.status}`);
        const answer = await api.commit((tx) => tx.entry(AssistantEntry, settled.answer), context);
        const text = answer?.model?.[0]?.content.flatMap((c) => (c.type === 'text' ? c.text : [])).join('') ?? '';
        return { content: [{ type: 'text', text }] };
      },
    }),
  ],
});

export default Subagent;
// Scripts must not start helpers.
export const modelOnly = ['subagent'];
```

Stop on the session aborts the helper too, since the call owns it. The session list already hides conversations owned by a task. The renderer is the one new piece: `details.conversationId` points at the child, and the body subscribes to it like any session and draws it with Bica's own transcript, folded by default. If that becomes the built-in `conversationId` convention from above, this extension needs no `client.tsx` at all.

## Plan

Each step is small and useful on its own.

1. Bica's prompt as Durable sections. Move `buildInstructions()` into a built-in `bica` extension with one short section each: `preamble` (untagged), `rules`, `gitbutler`, `project_context`, `skills`, and `cwd`. The reply rules stay in `instructions`, which Durable always renders last. Sections render before each request, so the prompt sync in `submit()` goes away. This step needs no loader, and it simplifies Bica on its own.
2. The loader for `~/.bica/extensions/`. Import TypeScript, call factories with the host object, wrap tools with `timeTools` and `withSummary`, install after the built-ins and before `resume()`, reload on change, and support `BICA_SAFE=1`. User extensions only, and no client code yet.
3. The first two extensions, RTK and the cheaper compaction. Each is one hook, so they show right away whether the loader works and whether Bica and the extension share one copy of Durable.
4. Codemode through the registry: scripts call every offered tool except the model-only ones, and nested calls run the extensions' `beforeTool` and `afterTool`. After this, RTK and guards see every command.
5. Tool rows: the `details` conventions (`markdown`, `conversationId`), then `client.tsx` renderers keyed by tool name.
6. Project extensions with trust, once a project actually wants one.

Alongside, the Durable gaps from [What's missing](#whats-missing) go upstream as issues: writable hooks, running a tool through the hooks, tool exposure, hook spend, and lifecycle.

## Open questions

- Approval. A guard can block, but asking you first needs a pause that survives restarts. Durable can't suspend a tool waiting for input. One option is to block with a message and let the model call `ask`, which is clunky. Another is a tool that waits on a document Bica writes when you answer, which isn't restart-safe unless it's a task.
- Editor types. For `defineExtension` and `BicaHost` to type-check in `~/.bica/extensions/`, the editor needs Bica's types. A generated `~/.bica/extensions/tsconfig.json` pointing at Bica's `node_modules` might do.
- Should an extension be able to replace Bica's built-ins (its bash, its prompt sections) outright, or only wrap them? Replacing loses GitButler claiming and change tracking, which live in Bica's wrappers.
- Extension settings, such as an RTK exclude list. A JSON file next to the extension is the simplest, and the extension reads it itself.
- Whether a project's worktrees should ever load their own copy of the extensions, for working on an extension inside a branch.
