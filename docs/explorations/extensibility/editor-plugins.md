# Plugin architectures of editors and editor-like tools, read for Bica

How ProseMirror, CodeMirror 6, Lexical, Tiptap, Slate, Emacs, lazy.nvim, Rollup/Vite, and webpack's Tapable answer five questions: where a plugin keeps state, in what order plugins run, how they talk to each other, how they depend on each other, and how they are switched on and off at runtime. Each section ends with what Bica should take and what it should leave. The last sections answer the open questions from the notes and rank the ideas.

Research only. Nothing in the repo was changed.

## The short version

The existing plan (`docs/explorations/extensions.md`) is a good list of _places_ to extend, but it has no _configuration model_: nothing says how a set of extensions becomes one ordered, deduplicated, configured whole for a given session. Every editor here has exactly that piece at its centre (CodeMirror's `flatten`, Lexical's `LexicalBuilder`, lazy.nvim's spec merger, Vite's plugin sort), and it is the piece that answers ordering, dependencies, config, and enable/disable all at once.

What the plan misses or gets wrong:

1. **Installing is not selecting.** The plan says the loader installs extensions "after the built-ins". But `src/server/agent/harness.ts` passes `settings.extensions: DEFAULT_EXTENSIONS` explicitly, so an installed extension is selected by no session at all. And the hub and night profiles store an explicit extension array per conversation (`src/server/profiles/registry.ts`), so even a changed default never reaches them. A user extension has to be put into a _resolved, ordered selection_, not just into the registry.
2. **Order is accidental.** In Durable, everything is ordered by the selected extension list: sections render in that order, a later same-name tool wins, `beforeTool` rewrites chain in that order and the first `block` wins, the first `onYield` `continue` wins, the first `beforeCompact` decision wins (`dist/harness/types.d.ts`). Folder scan order or install order is not a contract. Every editor here resolves order from an explicit precedence bucket plus a position, and Bica needs the same, deterministic so the prompt cache holds.
3. **No communication or dependency story.** Services such as `vcs` are named, but not how an extension finds one, types it, or declares that it needs one. Lexical (`dependencies` by reference with a typed `output`, `peerDependencies` by name) and Rollup (`api` on the plugin) answer this directly.
4. **Profiles are left out.** They stay hand-coded objects, though the notes want profiles and "agents" as extensions. In editor terms a profile is a _bundle_ of extensions plus config overrides at a higher precedence (a CodeMirror extension array, a lazy.nvim spec fragment, a Tiptap `extend()`), and switching one is a compartment reconfigure.
5. **Bica's own lifecycle has no hooks.** Durable's hooks cover a run. But night runs, upkeep, the cleanup judge, notes between sessions, worktree creation, commit messages, and voice turns are Bica orchestration, not Durable tasks. Turning them into extensions needs Bica-level hook points with declared kinds (observer, waterfall, bail), the way Rollup and Tapable declare every hook's kind.
6. **Everything loads eagerly.** The UI half `import()`s every `client.tsx`. VS Code, lazy.nvim, and CodeMirror's `appendConfig` all separate a static declaration (what a plugin contributes) from its code (loaded on first use).
7. **No config merging.** There is no place for an extension's options, nor a rule for how user, project, and profile overrides combine. lazy.nvim's `opts` merge and Lexical's `config` plus `mergeConfig` are the two clean answers.

One thing Bica already does right, in editor terms: `on(key)` in `registry.ts` renders each prompt section by reading the session's profile from `SessionDoc` at render time. That is a CodeMirror _computed facet_ (`facet.compute([field], …)`): the extension list stays fixed while a value derived from state picks the content. The same trick generalizes to per-session toggles without rewriting each session's stored extension list.

## Bica today, read as a plugin system

Facts from the installed Pi Durable and Bica's code, since every translation below builds on them.

- A Durable extension is a named bundle of `tools`, `sections`, `hooks`, `wraps`, and `tasks`. The registry holds installed code. `registry.install()` with a used name replaces the code live; work already running keeps the old code.
- A conversation stores its selection as _names_ in `pi.agent`. `configure({ extensions: { add, remove } })` edits the host default; `configure({ extensions: [...] })` selects exactly that list, in order; `null` returns to the host default. `settings` "is read at every use and never stored, so getters make it live" (README, Settings).
- How hooks of several extensions combine (from `dist/harness/types.d.ts` and `tool.js`), always in selection order:

| Hook | Kind, in Tapable terms |
| --- | --- |
| `beforeTool` | waterfall on `arguments`, bail on `block`; a throw blocks |
| `afterTool` | waterfall: each replaces the result |
| `beforeRequest` | waterfall on `messages`, for that request only |
| `afterResponse`, `afterTools` | observers |
| `onYield` | bail: the first `continue` wins |
| `beforeCompact` | bail: the first decision wins |
| same-name tool | override: the later selected wins; `wrapTool` decorates the winner |
| sections | list, rendered in selection order |

- Bica's selection is `[BicaPrompt, ...profile.tools, BicaContext, ToolSummary]`. The head and tail section keys are fixed lists (`HEAD_SECTIONS`, `TAIL_SECTIONS` in `common.ts`) so every profile renders sections in one order and the cache holds. A profile fills those keys.
- Documents (`defineDoc`) are typed JSON committed atomically with entries, with a `fork` policy and optional `rewindable` history. They are the state-field mechanism.

So Bica already has: a registry, an ordered selection, typed state, transactions (commits), and hooks with fixed combination rules. What it lacks is the resolver in front of the selection.

---

## ProseMirror

### How it works

A `Plugin` is part of the `EditorState`, not of the view, because it needs to see every transaction.

```js
const key = new PluginKey("counter")
const counter = new Plugin({
  key,
  state: {
    init(config, state) { return 0 },
    apply(tr, value, oldState, newState) {
      return tr.getMeta(key) === "reset" ? 0 : value + 1   // must return a new value, never mutate
    },
    toJSON: v => v, fromJSON: (config, v) => v,
  },
  props: { handleKeyDown(view, e) { return false } },     // false = not handled, next plugin's turn
  filterTransaction(tr, state) { return true },            // false cancels the transaction
  appendTransaction(trs, oldState, newState) { return null }, // may add a follow-up transaction
  view(editorView) { return { update(view, prev) {}, destroy() {} } },
})
key.getState(state)   // read another plugin's state without holding its instance
```

- **State.** Each plugin may own one state field, initialized with `init` and advanced with `apply(tr, value)`. Values are immutable. A field's `apply` sees a half-built `newState` that lacks the fields of plugins _after_ it, so a field may only depend on fields earlier in the list. Optional `toJSON`/`fromJSON` make it persistable.
- **Keys.** A `PluginKey` names a plugin so others can read its state (`key.getState(state)`) or address metadata to it without importing the instance. Only one plugin per key may be active; a second instance throws `Adding different instances of a keyed plugin` ([state.ts](https://github.com/ProseMirror/prosemirror-state/blob/master/src/state.ts)).
- **Props and precedence.** Props given directly to the view come first, then each plugin in array order. How duplicates combine depends on the prop: for some (`domParser`) the first value wins; for boolean handlers the first that returns `true` handles the event; for `attributes` and `decorations` the values are unioned.
- **Messages.** `tr.setMeta(keyOrPlugin, value)` / `tr.getMeta(...)` attach data to a transaction. The undo history marks its own transactions this way, and the library defines a few string keys (`"addToHistory"`, `"paste"`). Using plugin objects as keys avoids collisions. This is the bus: one plugin dispatches a transaction with meta, another's `apply` reacts.
- **Filters and follow-ups.** `filterTransaction` can veto. `appendTransaction` can add a transaction after a batch; when another plugin appends, every plugin's `appendTransaction` runs again "with the new state and new transactions, but only the new transactions", until no one appends.
- **View plugins.** `view(editorView)` returns an object with `update` and `destroy` for DOM work. On any change of the plugin set, the view destroys _all_ plugin views and recreates them ([prosemirror-view `updatePluginViews`](https://github.com/ProseMirror/prosemirror-view/blob/master/src/index.ts)).
- **Reconfiguring.** `state.reconfigure({ plugins })` keeps state fields of plugins present in both sets, drops the removed ones, and `init`s the new ones.

### In Bica terms

- A session is a ProseMirror state. A Durable commit is a transaction. A Durable document is a plugin state field, already with `initial()` and a fork policy (ProseMirror has none; Durable's `fork: "initial" | "current" | "asOf"` is better).
- `setMeta` on a transaction maps to _data attached to what flows through the hooks_: tool `details`, entry metadata, the `call` a hook sees. ProseMirror's convention is the useful part: library-defined keys are plain strings (`addToHistory`), plugin keys are the plugin itself. For Bica: core-defined `details` keys stay unprefixed (`markdown`, `conversationId`, as the plan proposes), and anything an extension adds lives under its name (`details["rtk"]`).
- Props precedence maps to UI slot resolution. Each slot needs a declared combine rule, and ProseMirror shows there are exactly three in practice: first value wins (a file-type viewer), first handler that says "handled" wins (a key or drop handler), union (tabs, toolbar actions, decorations on a transcript row).
- `appendTransaction` is what the plan lists as Durable's gap "hooks can't write (append a context edit or a steer)". ProseMirror's loop rule (rerun only with what is new, stop when nobody appends) is the shape to propose upstream, with Lexical's budget (below) as the loop guard.

### Avoid

- Recreating every view plugin when one plugin changes. On a reload of one UI extension, Bica should remount only that extension's pieces (CodeMirror does this right).
- Field order constraints you can't see: in ProseMirror a field can read only earlier fields. If Bica extensions read each other's documents at render time, the read must go through committed state, not "whatever ran before me".

Links: [Guide: plugins](https://prosemirror.net/docs/guide/#state.plugins), [Guide: props](https://prosemirror.net/docs/guide/#view.props), [Reference: PluginSpec](https://prosemirror.net/docs/ref/#state.PluginSpec), [EditorState.reconfigure](https://prosemirror.net/docs/ref/#state.EditorState.reconfigure).

---

## CodeMirror 6

The most complete answer of the set, and the closest to what Bica needs, because CodeMirror separates _configuration_ (what is active, in what order) from _state_ (values that change with transactions) and resolves the first once per reconfiguration.

### How it works

**Extensions are values, nested arbitrarily.** An extension is a state field, a facet input, a view plugin, a `Prec` wrapper, a compartment, an object with an `extension` property, or an array of any of these. Configuration flattens the tree.

**Deduplication by identity.** During flattening, an extension already seen is skipped, unless it now appears in a _higher_ precedence bucket, in which case it moves there ([`flatten` in facet.ts](https://github.com/codemirror/state/blob/main/src/facet.ts)). So a feature can pull in its dependencies freely; including a shared field twice yields one field. The guide's advice: create static extension values once and return the same instance from your constructor function, and put configuration in a module-private facet whose `combine` reconciles or throws on conflicting configs.

**Precedence.** Five buckets: `Prec.highest`, `high`, `default`, `low`, `lowest`. All of a higher bucket comes before all of a lower one; within a bucket, flattened array position decides.

```js
[Prec.high(A), B, Prec.high([C, D])]   // resolves to A, C, D, B
```

The documented division of labour matters: extension _authors_ use `Prec` to put parts of their extension in a bucket (a fallback default at `lowest`, a special keybinding at `high`); the code _assembling_ the configuration controls everything else through array order.

**Facets are extension points that combine many inputs into one output.**

```js
const tabSize = Facet.define({ combine: values => values.length ? values[0] : 4 })   // highest precedence wins
const handlers = Facet.define()                                                      // output = sorted array
const multiSel = Facet.define({ combine: vs => vs.some(Boolean) })                   // logical or
const info = Facet.define()
EditorState.create({ extensions: [
  info.of("hello"),
  info.compute(["doc"], s => `lines: ${s.doc.lines}`),   // derived input, recomputed when deps change
  someField.provide?.(f => info.from(f)),                // input read from a state field
]})
state.facet(info)  // ["hello", "lines: 2"]
```

Options: `combine`, `compare`, `compareInput`, `static` (forbid dynamic inputs), and `enables` (extensions added to any state where the facet is provided). Outputs are recomputed only when inputs change, so identity checks tell whether a facet changed.

**State fields and effects.** `StateField.define({ create, update(value, tr), compare, provide, toJSON, fromJSON })`. Fields react to `StateEffect`s, typed values attached to a transaction that mean "something happened" (`StateEffect.define<T>({ map })`). `Annotation`s are metadata about a transaction (user event, "from remote") that don't change state themselves. Effects are the message bus; a field is the mailbox.

**Transaction hooks** are facets too:

- `EditorState.changeFilter`: suppress all or part of a transaction's changes.
- `EditorState.transactionFilter`: replace or extend a transaction spec. Skipped when the transaction sets `filter: false`. Marked "use with care".
- `EditorState.transactionExtender`: may only add effects and annotations, runs even when filtering is off, after filters.

**View plugins.** `ViewPlugin.fromClass(class { constructor(view); update(u); destroy() })`. "View plugins should generally not hold (non-derived) state. They work best as shallow views over the data kept in the editor state." "When a view plugin crashes, it is automatically disabled to avoid taking down the entire view." On reconfiguration, only plugins that left the configuration are destroyed.

**Compartments.** Mark a part of the tree as swappable:

```js
const language = new Compartment
EditorState.create({ extensions: [basicSetup, language.of(python())] })
view.dispatch({ effects: language.reconfigure(javascript()) })
```

Compartments nest; an extension can own a private compartment to toggle its sub-extension, and if a parent compartment is reconfigured, the private one vanishes with it. `StateEffect.reconfigure` replaces the whole top level while keeping fields and compartments that exist in both; `StateEffect.appendConfig` injects an extension on demand (snippets add their field the first time they are used). The docs prefer computed facets over reconfiguration when a value can just be derived: "a form of derived state, rather than adding new fundamental state."

**Styling.** `EditorView.baseTheme` adds styles at the lowest precedence with `&light`/`&dark` variants, so any user theme overrides an extension's own look. `EditorView.theme` adds a real theme.

### In Bica terms

- **The resolver.** CodeMirror's flatten-dedupe-bucket step is the missing piece in the plan. Bica's version: take built-ins, user extensions, and trusted project extensions; flatten their dependencies; dedupe by name; sort by bucket, then dependency order, then position; produce the Durable list. Feed it through a getter on `settings.extensions`, which Durable reads at every use. That is `StateEffect.reconfigure` for the whole host: one place decides order for every session that follows the default.
- **Facets for prompt sections.** Durable sections are already rendered by fixed key. Make each key a facet: extensions _contribute to_ `rules`, `project_context`, or a new key, and the facet's combine joins them in precedence order. The number and order of Durable sections stay fixed, which keeps the prompt cache stable as extensions come and go, and the rule from `instructions.md` that sections changing least come first still holds per key. Today's "a tool's line and rules come only with the tool" is a facet with `enables`: providing the tool provides its line.
- **Facets for profile values.** A profile's model, effort, `panels`, `longLived`, and role text become facet inputs: `model` takes the highest precedence; `panels` is an and/or; `role` is the highest precedence. Night is then `[coding, Prec.high(nightRole), withoutTool("ask")]` instead of a hand-written object.
- **Facets for UI slots.** `rightPanel.tab`, `topbar.action` are list facets; `codeView` by file type is a first-match facet; `transcript.tool` by tool name is first-match plus wraps. A slot's value in the browser is a Solid memo over the facet output, so it updates when an extension loads or unloads.
- **Compartments per profile and per extension.** Durable stores selections as names, so a compartment is a _stable name whose content Bica swaps_: e.g. a `bica.user` extension whose sections and hooks dispatch to the current user extensions, reinstalled with `registry.install()` on change. Conversations that select `bica.user` never need their stored list rewritten. A private compartment per extension (on/off per session) is a flag in `SessionDoc`, read at render or hook time, which is exactly how `on(key)` reads the profile today. Tools are the exception: Durable decides offered tools from the selection, so per-session tool toggles need `configure({ tools })` or `modelTools`, not a doc flag.
- **`appendConfig` is lazy loading.** Durable already has the agent-side analogue: `deferred: true` tools plus `tool_search`. The plan never mentions it; it is the right default for large extension tool sets (MCP-like).
- **Effects vs annotations.** If Bica adds its own event bus, keep CodeMirror's split: an effect changes state (a document edit, committed), an annotation only describes (who sent this prompt, from the phone). Durable commits already carry the first; the second is what "who sent its last prompt" in `tools.md` is.
- **Crash = disable that piece.** A UI contribution that throws gets disabled and reported; the rest of the slot renders. CodeMirror's `EditorView.exceptionSink` facet is where errors go; Bica's equivalent is a visible "extension errors" list, not just the console.
- **Styling.** `baseTheme` at lowest precedence is the answer for "CSS/theme exposure": an extension's own styles use Bica's Tailwind tokens and sit below Bica's theme layer, so the user's theme wins.

### Avoid

- Its abstraction count. Facets, fields, effects, annotations, compartments, Prec, view plugins, and three kinds of transaction filters are a lot for one person's tool. Bica needs facets, buckets, the resolver, and documents; compartments can be the one `SessionDoc` flag trick.
- `transactionFilter`-style full rewrite as the default. Prefer the restricted form (`transactionExtender`: only add, never rewrite) for most hooks, as `afterResponse` and `afterTools` already are.

Links: [System guide: extending](https://codemirror.net/docs/guide/#extension), [Configuration example (precedence, compartments)](https://codemirror.net/examples/config/), [Reference: Facet, StateField, filters](https://codemirror.net/docs/ref/#state.Facet^define), [facet.ts flatten](https://github.com/codemirror/state/blob/main/src/facet.ts).

---

## Lexical

Two layers: the older commands, listeners, and node replacement; and the newer **Lexical Extensions** (`defineExtension`, `buildEditorFromExtensions`), which add dependencies, config, and phases. The second is the most direct prior art for Bica's dependency and config questions.

### Commands and listeners

```js
const HELLO = createCommand<string>('HELLO')
const remove = editor.registerCommand(HELLO, payload => { /* … */ return true }, COMMAND_PRIORITY_EDITOR)
editor.dispatchCommand(HELLO, 'hi')
remove()
```

- Listeners run from highest priority to lowest (critical, high, normal, low, editor) until one returns `true`.
- Each level has a `BEFORE_` variant. Within a level, `BEFORE_X` listeners run most recently registered first, then `X` listeners in registration order. The docs now call the plain higher levels "legacy" and recommend `COMMAND_PRIORITY_BEFORE_EDITOR` for nearly all overrides: "the last-registered-called-first ordering is suitable for almost all use cases". An observer that must see a command before its handler swallows it registers at the `BEFORE_` variant of the handler's level, "without escalating the priority".
- `registerUpdateListener`, `registerMutationListener(NodeClass, fn)`, `registerNodeTransform`. Listeners that schedule another update cause "waterfall" updates; Lexical keeps a **cascade budget**: more than 100 re-enqueues without yielding discards the queue and warns. Transforms run inside the same update to avoid the waterfall.
- Every `register*` returns a cleanup; `mergeRegister` combines them; an extension's `register` returns the combined cleanup.

### Node replacement

```js
nodes: () => [CustomParagraphNode,
  { replace: ParagraphNode, with: node => $createCustomParagraphNode(), withKlass: CustomParagraphNode }]
```

`withKlass` makes transforms and mutation listeners registered for the original class apply to the replacement too. This is "replace a built-in and keep everything that targeted it working".

### Lexical Extensions

```js
export const LinkLogger = defineExtension({
  name: '@my-app/LinkLogger',
  dependencies: [LinkExtension, configExtension(ReactExtension, { decorators: [<X/>] })],
  peerDependencies: [declarePeerDependency('@lexical/markdown', { /* config override if present */ })],
  conflictsWith: ['@lexical/plain-text'],
  config: safeCast<{ disabled: boolean }>({ disabled: false }),
  mergeConfig(a, b) { /* default: shallowMergeConfig */ },
  build(editor, config, state) { return namedSignals(config) },        // → output
  register(editor, config, state) {
    const { disabled } = state.getOutput()
    return effect(() => disabled.value ? undefined : editor.registerCommand(/* … */))
  },
})
```

- **Names** are required and unique; same name with the same object dedupes, same name with a different object throws `Multiple extensions registered with name %s` ([LexicalBuilder.ts](https://github.com/facebook/lexical/blob/main/packages/lexical-extension/src/LexicalBuilder.ts)).
- **Dependencies** by reference form a DAG, topologically sorted; cycles fail. A dependency can be wrapped in `configExtension` to set its config.
- **Peer dependencies** are by name and optional: "enable some functionality or configuration only when some other extension is available" (Markdown export for an emoji node, only if Markdown is present). They still take part in the sort.
- **conflictsWith** gives an early error (rich text vs plain text).
- **Phases:** `config` (defaults, overridable by others) → `mergeConfig` → `init` (before the editor exists, can read peers) → `build` (gets the editor, returns `output`) → `register` (listeners, returns cleanup) → `afterRegistration`. **`output`** "is generally how extensions provide functionality to each other": shared structures, commands, typed theme config.
- **Signals** (Preact signals re-exported) are the runtime config channel: `disabled` as a signal, `effect` re-registers when it flips, `peek` reads without subscribing.
- The motivation they give fits Bica exactly: features need both configuration (before the editor) and registration (after), "in very different places in the code", "no transitive dependencies", and "when some dependent configuration or registration is missing (or runs twice!) … often it will partially work which is tricky to debug."

### In Bica terms

- **Commands for UI actions.** Bica's command palette and shortcuts are a command bus waiting to be named: `open-file`, `send-prompt`, `new-worktree`, `toggle-panel`. Typed commands with a bail return let an extension override "open file" for `.ipynb` without touching the built-in, and observe "send prompt" before it goes. Use few levels and the `BEFORE_` idea (relative, latest-first) instead of a numeric race.
- **Node replacement with `withKlass`** maps to replacing a built-in _service provider_ while everything registered against the built-in keeps working: replacing git with another VCS must keep every `vcs` consumer and every hook keyed on it.
- **Dependencies, peers, conflicts, output** are the answer to the notes' "parent/children" and "how extensions communicate":
  - `dependencies: [Git]` by import gives a typed `output` (the service). The Git panel UI extension depends on the `vcs` service extension.
  - `peers: ['voice']` adds behaviour only when voice is present (a hold-music hook).
  - `conflicts: ['coding']` for the hub profile, which the server already enforces by hand.
- **Phases** map onto Bica's two halves: `config`/`init` = server start and resolve, `build` = install into the Durable registry and start services, `register` = per-socket or per-session registrations with cleanup. The browser half has its own `register` that returns a Solid root's dispose.
- **Signals.** Bica is on Solid; Lexical picked signals for the same reason Bica uses Solid. An extension's runtime config (disabled, a threshold) should be a signal fed from settings, read in effects, rather than requiring a reinstall.
- **Cascade budget.** Whenever Bica lets hooks write or continue (`onYield` continue, a future "append" hook), give it Lexical's budget: a fixed count per run, after which Bica stops and reports. The plan's "memo as a loop guard" for "keep going until tests pass" is the per-extension version; the host should have one too.

### Avoid

- Lexical's dual history: legacy priorities plus `BEFORE_` variants plus React plug-ins plus extensions. Start with the extension model only.
- `init` as "a last resort for making mutations": one phase too many for Bica.

Links: [Commands](https://lexical.dev/docs/concepts/commands), [Listeners](https://lexical.dev/docs/concepts/listeners), [Node replacement](https://lexical.dev/docs/concepts/node-replacement), [Extensions intro](https://lexical.dev/docs/extensions/intro), [Defining extensions](https://lexical.dev/docs/extensions/defining-extensions), [Peer dependencies](https://lexical.dev/docs/extensions/peer-dependencies), [Signals](https://lexical.dev/docs/extensions/signals).

---

## Tiptap

A friendlier layer over ProseMirror. Its ordering and inheritance choices are the ones most people meet first.

```js
const CustomLink = Link.extend({
  priority: 1000,                                       // default 100; higher loads first
  addOptions() { return { ...this.parent?.(), openOnClick: false } },
  addStorage() { return { clicks: 0 } },                // editor.storage.link.clicks, mutable
  addExtensions() { return [Underline.configure({})] }, // bundles (StarterKit is one)
  addProseMirrorPlugins() { return [/* … */] },
})
new Editor({ extensions: [StarterKit, CustomLink.configure({ autolink: true })] })
```

- **Priority** decides registration order, which decides ProseMirror plugin order and schema order. Default 100; Link uses a higher one so it nests outside other marks.
- **`extend()`** creates a variant that can call the original through `this.parent()`; everything can change except the name, which is part of stored JSON.
- **`configure()`** sets options for one use.
- **`addExtensions`** nests extensions, like StarterKit. There is no real dependency graph; duplicate names produce a warning, not a resolution.
- **Storage** is a mutable object per extension, namespaced by name on `editor.storage`, typed through `declare module '@tiptap/core' { interface ExtensionStorage { … } }`.

### In Bica terms

- `extend()` with `this.parent` is how Bica's profiles already work in code ("it can reuse parts of Coding or of `common.ts`"). Keep it as the authoring style for _variants_ (night extends coding), but resolve the result through the facet/precedence model, not class inheritance.
- **`declare module` augmentation** is the cheapest way to type slot props, service outputs, and per-extension documents across separately written extensions, checked by `bun check`: `declare module 'bica' { interface Slots { 'rightPanel.tab': TabProps } interface Services { vcs: Vcs } }`.
- "The name is part of the stored JSON" is true for Bica too: Durable stores extension names in `pi.agent`, documents by `kind`. Renaming an extension orphans state, as the comment on `bica-replies` in `registry.ts` already notes. Names need to be treated as permanent ids.

### Avoid

- A single global number for priority. Tiptap's 100/1000 and lazy.nvim's 50/1000 show how numbers drift into an arms race. Buckets plus relative "before X" age better.
- Mutable, unpersisted, non-reactive storage. Bica's state belongs in Durable documents (persisted, forked correctly) or in Solid signals, not a plain object.

Links: [Extension API](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension), [Extend existing extensions](https://tiptap.dev/docs/editor/extensions/custom-extensions/extend-existing).

---

## Slate

"A plugin is simply a function that takes an `Editor` object and returns it after it has augmented it":

```js
const withImages = editor => {
  const { isVoid } = editor
  editor.isVoid = el => el.type === 'image' ? true : isVoid(el)
  return editor
}
const editor = withHistory(withReact(withImages(createEditor())))
```

Order is the wrapping order: the outermost wrapper runs first. It is the smallest possible plugin system and works well for a few wrappers. It has no names, no removal, no introspection ("which plugins wrapped `insertBreak`?"), no dependencies, and no way to reorder after the fact; Plate built a whole plugin system on top to get those back.

**For Bica:** Durable's `wrapTool` and the plan's `slot.wrap('bash', …)` are this pattern. Keep it, but named and removable, which is what Emacs advice adds (next).

Links: [Slate: Plugins](https://docs.slatejs.org/concepts/08-plugins).

---

## Emacs

Forty years of user extensibility, and the vocabulary everyone else borrows.

### Hooks

```elisp
(add-hook 'before-save-hook #'my-trim)            ; depth 0, goes to the front
(add-hook 'before-save-hook #'my-format 90)       ; depth -100..100, higher = later
(add-hook 'before-save-hook #'my-local nil t)     ; buffer-local; the local list gets `t`
```

- A normal hook is a list of functions; an abnormal hook passes arguments (`run-hook-with-args`), or stops early: `run-hook-with-args-until-success` (bail on first non-nil) and `-until-failure` (bail on first nil).
- Since Emacs 27, `add-hook` takes a **depth** from -100 to 100, default 0; ties at depth > 0 append after equals. The manual: "One should never use a depth of 100 (or -100), because one can never be sure that no other function will ever need to come before (or after) us." And: "hook functions should be designed so that the order in which they are executed does not matter. Any dependence on the order is asking for trouble."
- `add-hook` does not add a function already present (`equal`), which is identity dedupe, and recommends named functions over lambdas so removal works.
- **Buffer-local hooks** with `t` in the local list mean "also run the global ones": a per-buffer delta over a global default.

### Advice

```elisp
(advice-add 'save-buffer :around #'my-wrap '((name . my-wrap) (depth . -50)))
(advice-remove 'save-buffer 'my-wrap)
(advice-member-p 'my-wrap 'save-buffer)
```

Combinators: `:before`, `:after`, `:around` (gets the original as an argument), `:override`, `:before-while` / `:before-until` (veto or short-circuit), `:after-while` / `:after-until`, `:filter-args`, `:filter-return`. Advice has a name and a depth, can be listed (`advice-mapc`) and removed by name.

### Minor modes

`define-minor-mode` creates a mode variable (buffer-local for buffer modes), a toggle command, a keymap that is active while the mode is on (via `minor-mode-map-alist`, whose order is the precedence), and a mode hook that runs on enable and disable. Globalized minor modes turn a buffer mode on everywhere by default; a buffer can still opt out.

### In Bica terms

- **Session = buffer, extension = minor mode.** Global default plus per-session deltas is exactly Durable's `configure({ extensions: { add, remove } })` against the host default, the buffer-local list with `t`. The current code instead gives non-coding profiles an _explicit array_, which is a buffer-local list _without_ `t`: those sessions never see a new global extension. Use deltas.
- **Mode hooks** = enable/disable callbacks per session. Night turning back into Coding after its run is a mode turning off; its "off" hook is where the report-then-revert logic lives.
- **Profiles as major modes, features as minor modes.** One profile per session (major), any number of toggles on top (minor), each with a visible indicator, like the mode line. The context chip menu already toggles assistant mode this way.
- **Advice combinators** give names to what `wrap` should allow: `around` (wrap a tool row renderer, wrap a tool), `filter-args` (Durable's `beforeTool` arguments), `filter-return` (`afterTool`), `before-while` (`beforeTool` block). Name each wrap and keep a list, so Settings can show "bash is wrapped by rtk, timing".
- **Depth with a "never use the extremes" rule.** Reserve the outer buckets for Bica's own wrappers (timing, the summary field) so user extensions can't get outside them by accident.
- **`with-eval-after-load`** is the Emacs form of a peer dependency: run this config only if and when that package loads.

### Avoid

- Global dynamic variables as the communication channel. Emacs works because everything is one image; Bica's state should stay in typed documents.
- Advice on internals as a stable API. Advice is for the user's last-resort override; extension authors should target declared extension points.

Links: [Setting Hooks](https://www.gnu.org/software/emacs/manual/html_node/elisp/Setting-Hooks.html), [Advice Combinators](https://www.gnu.org/software/emacs/manual/html_node/elisp/Advice-Combinators.html), [Minor Modes](https://www.gnu.org/software/emacs/manual/html_node/elisp/Minor-Modes.html) (source: [modes.texi](https://github.com/emacs-mirror/emacs/blob/master/doc/lispref/modes.texi), [functions.texi](https://github.com/emacs-mirror/emacs/blob/master/doc/lispref/functions.texi)).

---

## Neovim's lazy.nvim

A plugin manager, not a plugin API, but it solves the parts a personal tool hits daily: loading, dependencies, config layering, conditional enabling.

```lua
{ "nvim-neo-tree/neo-tree.nvim",
  dependencies = { "nvim-lua/plenary.nvim", "MunifTanjim/nui.nvim" },
  cmd = "Neotree",                                      -- lazy: load on command
  keys = { { "<leader>ft", "<cmd>Neotree toggle<cr>", desc = "NeoTree" } },
  enabled = true,                                       -- false: not in the spec at all
  cond = function() return not vim.g.vscode end,        -- false: installed but not loaded
  opts = { window = { width = 30 } },                   -- merged with other specs of this plugin
}
{ "folke/tokyonight.nvim", lazy = false, priority = 1000 }   -- start plugin, loads first
```

- **Dependencies** load with the plugin and are lazy by default.
- **Lazy loading** on `event`, `cmd`, `ft`, `keys`, and automatically on `require` of the plugin's module. `keys` with a rhs creates a stub that loads the plugin on first press. A plugin is lazy when it only appears as a dependency, has a trigger, or `defaults.lazy` is set.
- **Priority** only orders _start_ plugins; default 50, colorschemes 1000.
- **`enabled` vs `cond`**: `enabled = false` removes the plugin (and uninstalls on clean); `cond = false` keeps it installed and just doesn't load it, "useful to disable some plugins in vscode".
- **Spec merging.** The same plugin can be specified in many places (a distro, a user override). "`opts`, `dependencies`, `cmd`, `event`, `ft` and `keys` are always merged with the parent spec. Any other property will override the property from the parent spec" ([lazy.nvim.txt](https://github.com/folke/lazy.nvim/blob/main/doc/lazy.nvim.txt)). `opts` as a table deep-merges; as a function `opts(plugin, opts)` it mutates or returns a replacement.
- **`optional = true`**: the spec is used only if the plugin is specified elsewhere without `optional`, so a distro can configure plugins the user may not have. **`specs`**: specs scoped to a plugin; disabling the plugin drops them.

### In Bica terms

- **Layers of config for one extension**: built-in defaults ← `~/.bica/extensions` config ← project `.bica/extensions` config ← profile overrides ← per-session toggle. Lists extend, scalars override, a function can mutate. This is the "opts merging" the notes ask about, and it gives profiles a home: a profile is a spec fragment that sets other extensions' options.
- **`optional` and `specs`** answer "parent and children" better than Tiptap's `addExtensions`: the Git panel extension carries `specs` for its commit-message helper; turning Git off drops the helper. A project can ship optional config for an extension the user may not have installed.
- **`enabled` vs `cond`** maps to two levels Bica needs and the plan conflates: _loaded_ (in the registry, its tasks can resume, its documents are readable) vs _active for this session_ (selected, its hooks run). Durable's README makes the case: a stored name whose code is uninstalled "just stops getting it"; pending tasks of a missing extension wait. So "disable" should usually mean `cond` (stay installed, stop running) so durable work and documents aren't stranded.
- **Lazy triggers** for the UI half: a client bundle loads when its slot first shows, its file type first opens, its command first runs, or its tool's row first renders. Agent-side: `deferred` tools.
- **Priority only for what must load first** (themes, the shell layout). Everything else ordered by dependencies.

### Avoid

- Lua-table magic merging that is hard to predict; lazy.nvim's merge rules needed a doc note and a function escape hatch. Bica's merge should be shallow by default with an explicit per-field merge, like Lexical's `mergeConfig`.

Links: [Plugin spec](https://lazy.folke.io/spec), [Lazy loading](https://lazy.folke.io/spec/lazy_loading).

---

## Rollup and Vite

### How it works

Every hook has a declared **kind**:

- `first`: run in order until one returns non-null (`resolveId`, `load`).
- `sequential`: all run in order, each awaited (`transform`, `options`).
- `parallel`: all start in order, not awaited (`buildStart`, `writeBundle`).
- plus `async` or `sync`.

A hook can be an object with `order: 'pre' | 'post' | null` (per hook, not per plugin), `sequential: true` (for a parallel hook: wait for earlier ones, then let the rest run in parallel), and `filter: { id, code }` so Rollup skips calling it at all.

```js
{ name: 'resolve-first', resolveId: { order: 'pre', handler(source) { /* … */ } } }
{ name: 'jsx', transform: { filter: { id: '*.jsx', code: '<Custom' }, handler(code) { /* … */ } } }
```

Vite adds a per-plugin `enforce: 'pre' | 'post'` and `apply: 'serve' | 'build' | (config, env) => boolean`. Resolved order: alias → user `pre` → Vite core → user normal → Vite build → user `post` → Vite post-build. Hook `order` still applies inside that.

**Inter-plugin communication** has three documented mechanisms:

1. **Custom resolver options**: `this.resolve(source, importer, { custom: { 'resolving-plugin': {…} } })`, keyed by the target plugin's name.
2. **Custom module meta-data**: plugins annotate modules (`meta: { annotating: {…} }`, keyed by plugin name, JSON-serializable, persisted in the cache) and any plugin reads it with `this.getModuleInfo(id).meta`.
3. **Direct communication**: a plugin exposes `api`, and a dependent finds it by name in `buildStart({ plugins })`, throwing if it is required and missing.

```js
function parent() { return { name: 'parent', api: { doSomething() {} } } }
function dependent() {
  let api
  return { name: 'dependent',
    buildStart({ plugins }) {
      const p = plugins.find(p => p.name === 'parent')
      if (!p) throw new Error('This plugin depends on the "parent" plugin.')
      api = p.api
    } }
}
```

### In Bica terms

- **Declare each hook's kind in its type.** Durable already behaves this way (table above) but says so only in comments. Bica's own hooks should be explicit: `session.created` (parallel observer), `prompt.beforeSend` (sequential waterfall over the text), `commit.message` (first: the first extension to return a message wins, else the fast model, else the default, which is already today's fallback chain), `worktree.created` (parallel), `session.idle` (sequential, where upkeep and the cleanup judge would live).
- **Per-hook `order` over per-extension priority.** An extension may need to be early for one hook and late for another (RTK rewrites `bash` early; its logger reads results late). Rollup's design handles that; a single extension priority can't.
- **`filter` on hooks.** `beforeTool: { tools: ['bash'], handler }`: the host skips calls that can't match, and Settings can show which tools each extension touches. Cheap and great for introspection.
- **`apply`** = Durable-side "only in these profiles" or "only in sessions of this project", evaluated by the resolver.
- **Namespaced metadata.** Rollup's convention (data you add sits under your own name, anyone may read all) is the rule for `details`, documents, and session metadata. Bica's documents already use kinds like `app.todos`; make it `ext.<name>.<doc>`.
- **`api` by name** is the simplest service lookup and works without types. Lexical's typed `output` through a dependency by reference is better when both are TypeScript, which they are in Bica.
- **Bica already lives here:** `vite.config.ts` loads the server through Vite. Bica's own UI extension compile step (`client.tsx` → `/ext/<name>.js`) can be a Vite plugin with a virtual module, and Vite's `enforce`/`apply` vocabulary will already be familiar.

### Avoid

- Plugin-position-in-the-array as the only order. Rollup needed `order` and `sequential` after the fact; Vite added `enforce`. Design both levels in from the start.

Links: [Rollup: build hooks and kinds](https://rollupjs.org/plugin-development/#build-hooks), [Rollup: inter-plugin communication](https://rollupjs.org/plugin-development/#inter-plugin-communication), [Rollup: direct plugin communication](https://rollupjs.org/plugin-development/#direct-plugin-communication), [Vite: plugin ordering](https://vite.dev/guide/api-plugin#plugin-ordering), [Vite: conditional application](https://vite.dev/guide/api-plugin#conditional-application).

---

## webpack's Tapable

Hooks as first-class objects, one class per combination rule.

```js
const hook = new AsyncSeriesWaterfallHook(['messages'])
hook.tapPromise({ name: 'rtk', stage: -10 }, async m => m)          // lower stage runs earlier, default 0
hook.tapPromise({ name: 'guard', before: 'rtk' }, async m => m)     // relative order by name
hook.intercept({ register: tap => tap, call: (...a) => {}, tap: info => {}, error: e => {}, result: r => {}, done: () => {} })
await hook.promise(initial)
```

- Classes: `SyncHook`, `SyncBailHook` (first non-undefined wins), `SyncWaterfallHook` (thread a value), `SyncLoopHook` (restart until every tap returns undefined), and async variants `AsyncParallelHook`, `AsyncParallelBailHook`, `AsyncSeriesHook`, `AsyncSeriesBailHook`, `AsyncSeriesWaterfallHook`, `AsyncSeriesLoopHook`. `HookMap` keys hooks by a value (one hook per file type, per tool name).
- Taps carry a required `name`, a numeric `stage`, and `before: name | name[]`; `before` wins over stage for the taps it names; unknown names are ignored.
- **Interceptors** see registration, each call, each tap, errors, results, and completion, and can rewrite taps at registration. webpack's profiling and progress plugins are interceptors.
- An optional shared `context` object lets taps pass values down a call.

### In Bica terms

- Tapable's class names are the vocabulary for the "declare each hook's kind" rule: Durable's `beforeTool` is an async series waterfall with bail; `onYield` is an async series bail that, with `continue`, behaves like a loop hook across turns.
- **`HookMap`** is what `transcript.tool` by tool name and `codeView` by file type are: one hook per key, so lookup is cheap and "who handles `.ipynb`" is answerable.
- **`before: name`** is the relative ordering Bica should offer instead of numbers: "run my guard before rtk".
- **Interceptors** generalize `timeTools()` and `ToolSummary`: one interceptor on every hook gives timing per extension, a trace of which extension changed a call's arguments, and a place to count failures and disable a misbehaving extension. That is the "extension inspector" a one-person tool needs when a prompt or a tool call looks wrong.

### Avoid

- Its API surface (eleven hook classes, three tap styles, context). Bica needs four kinds: observe, waterfall, first, and parallel.

Links: [tapable README](https://github.com/webpack/tapable).

---

## Side by side

|  | ProseMirror | CodeMirror 6 | Lexical ext. | Tiptap | Emacs | lazy.nvim | Rollup/Vite | Tapable | Pi Durable today |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Order | array order | 5 `Prec` buckets, then flattened position | topological, then registration; commands by priority | `priority` (100) | `depth` -100..100 | dependencies; `priority` for start plugins | `enforce` per plugin, `order` per hook | `stage`, `before` | selected list order |
| Dedupe | key must be unique (throws) | by identity, kept at highest precedence | by name; same object ok, other object throws | warns on duplicate names | `equal` functions | specs of one plugin merge | none | none | same name in registry replaces; later same-name tool wins |
| State | field per plugin, immutable | `StateField`, effects | `output`, signals, editor state | mutable `storage` | buffer-local variables | n/a | module `meta` | `context` | documents, committed |
| Communication | transaction meta keyed by plugin | `StateEffect`, facets, `Annotation` | commands, `output` | `editor.storage`, commands | hooks, variables | `require` | `api`, `meta`, `custom` | hook args, `context` | documents, `executeTool` |
| Dependencies | none | pull in by value | `dependencies`, `peerDependencies`, `conflictsWith` | `addExtensions` | `require`, `with-eval-after-load` | `dependencies`, `optional`, `specs` | find by name | none | none |
| Runtime toggle | `reconfigure` | compartments, `appendConfig` | signals (`disabled`) | recreate editor | minor modes, buffer-local | `cond`, lazy triggers | n/a | n/a | `configure()`, `install()` |
| Crash | throws | view plugin auto-disabled | throws | throws | error in hook | error | build fails | error interceptor | hook reported and skipped |

---

## The open questions, answered

**How do extensions communicate?** Three channels, in order of preference.

1. _Shared state:_ each extension owns Durable documents (`ext.<name>.<doc>`), others read them; changes are committed atomically with the transcript. ProseMirror and CodeMirror fields, Rollup's namespaced `meta`.
2. _Typed services:_ an extension's `output` (Lexical) or `api` (Rollup), reached through a declared dependency, typed with `declare module` (Tiptap). The `vcs` service is the first.
3. _Commands and events:_ a command bus for UI actions (Lexical), Bica-level hooks for lifecycle events with declared kinds (Rollup, Tapable). Data attached to calls and rows goes under the extension's name, with a few core keys unprefixed (ProseMirror).

**Order and priority?** Buckets plus relative names, resolved once. Five buckets is CodeMirror's number; three (`pre`, normal, `post`, Vite) is probably enough for Bica, with the outermost reserved for Bica's own wrappers (Emacs's "never use 100"). Inside a bucket: dependency order, then `before`/`after` by name (Tapable), then name, so the result never depends on folder scan order. Allow per-hook `order` (Rollup) for the rare extension that must be early in one hook and late in another.

**Dependencies, parent and children?** Lexical's three relations (`dependencies` by reference, `peers` by name and optional, `conflicts`) plus lazy.nvim's `specs` (children dropped with the parent) and `cond` (stay installed, stop running). Cycles are an error at resolve time, shown in Settings, and the cycle's members don't load.

**Extension-owned state and data layer?** Durable documents, with three additions: a naming convention per extension, a `version` bump with a migration function (ProseMirror and CodeMirror both have `toJSON`/`fromJSON`; Durable has `version` but the plan says nothing about migrating), and a rule from CodeMirror for the UI: client code holds only derived state; anything that must survive a reload lives on the server, which is already Bica's "the browser is a view".

**Dynamic loading of UI components?** Split each extension into a static manifest (name, slots it fills with ids, titles, icons, file types, tool names, commands, keybindings) and code. The resolver and the palette use the manifest; the code loads with `import()` when its slot first renders or its command first runs (lazy.nvim's `keys` stubs, VS Code's activation events). Each extension's client code runs in its own Solid root; disposing the root undoes every registration and effect, which is Solid's version of Lexical's `mergeRegister` and Obsidian's `register*`.

**React vs Solid for slots?** Every editor here keeps its plugin core framework-free and adds a framework as one extension (Lexical's `ReactExtension` with `decorators`; ProseMirror and CodeMirror view plugins are plain DOM). Bica should do the same at the bottom of the slot contract: `mount(el, props) → dispose`, where `props` are accessors. A Solid component is the sugar on top, sharing Bica's Solid through `window.__bica`. That bottom layer also fits Pierre, whose plain JavaScript entries Bica already uses, and lets a React adapter exist as one extension if anyone ever wants it, at the cost of a second runtime in the page.

**Testing the extension surface?**

- Make resolution pure (CodeMirror's state is testable without a view; `StateCommand` exists for that). `resolve(extensions, config, profile)` returns the ordered Durable list, every facet value, and every slot's contents. `bun test` snapshots it per profile, with fixture extensions: a dependency chain, a cycle, a conflict, a duplicate name, a `cond` off, a `before` rule.
- Agent hooks: a temporary harness with the fixture extensions installed runs the plan's test cases (RTK rewrite, `.env` guard, lint after edit, "keep going", cheap compaction) as scripted runs.
- UI: a fixture pack that fills every slot with worst-case content, opened with a query flag next to `?data=worst`, checked with `agent-browser` on desktop and phone sizes for slot space; a fixture that throws on mount, to check that only its piece disappears; safe mode with none.
- Types: `bun check` over the `declare module` slot and service interfaces catches props drift between Bica and extensions.

---

## A sketch, to make the ideas concrete

Not a design, just the shape the borrowed ideas add up to.

```ts
export default defineBicaExtension({
  name: 'rtk',                                 // permanent id: stored by Durable, keys its documents
  bucket: 'pre',                               // 'pre' | normal | 'post'; Bica's own wrappers sit outside
  before: ['guard'],                           // relative order inside the bucket
  dependencies: [Bash],                        // by reference; typed `output`
  peers: ['voice'],                            // optional, by name
  conflicts: [],
  cond: ({ profile }) => profile !== 'hub',    // loaded but inactive where false
  config: { commands: ['git status', 'ls'] },  // merged: defaults ← ~/.bica ← project ← profile
  agent: (config, host) => defineExtension({   // the Durable extension, as today
    name: 'rtk',
    hooks: [hook(ToolTask, { beforeTool: rewrite(config) })],
  }),
  contributes: {                               // facet inputs and slot entries, readable without loading code
    'prompt.rules': 'Shell output may be compressed by rtk.',
    'settings.section': { id: 'rtk', title: 'RTK' },
  },
  client: () => import('./client.tsx'),        // loaded on first use
});
```

`resolve()` turns all of these into: the Durable list behind a `settings.extensions` getter, a per-session `SessionDoc` flag for each `cond`, the facet values the prompt sections and profiles read, and the slot lists the browser renders.

---

## Ranked: the ideas most worth borrowing

Costs are rough, for one person with agents, and assume the plan's loader exists.

1. **One pure resolver in front of Durable's selection** (CodeMirror `flatten`, Lexical builder, lazy.nvim merge). Flatten dependencies, dedupe by name, sort by bucket → dependency order → `before` → name, merge config, evaluate `cond`, and serve the result through a `settings.extensions` getter. Fixes "installed but selected nowhere", makes order deterministic for the prompt cache, and gives one place to test. _Cost: medium, 2–3 days; touches `harness.ts` and `profiles/registry.ts`._
2. **Per-session deltas and doc flags instead of stored arrays** (Emacs buffer-local hooks with `t`, CodeMirror private compartments). Profiles store `{ add, remove }` against the default, never an explicit array, and per-session toggles are `SessionDoc` flags read at render and hook time, as `on(key)` already does. New extensions then reach existing hub and night sessions. _Cost: small, about 1 day, plus a one-time migration of stored hub and night selections._
3. **Facets as the extension point type** (CodeMirror). Prompt section keys, profile values (model, effort, panels, long-lived, role), and UI slots each get a declared combine: list, first, highest-precedence, or/and. Keeps the Durable section list fixed for the cache, and makes profiles bundles of facet inputs instead of hand-coded objects. _Cost: medium, 2–4 days, most of it moving profiles over._
4. **Declared hook kinds for Bica's own lifecycle** (Rollup kinds, Tapable classes). `session.created`, `session.idle`, `prompt.beforeSend`, `commit.message`, `worktree.created`, each typed as observe, waterfall, first, or parallel, with an optional `filter`. Without these, night runs, upkeep, notes, and the cleanup judge can't become extensions. _Cost: medium, 1 day for the mechanism, then per feature as each moves._
5. **Dependencies by reference with typed output, peers by name, conflicts** (Lexical), with `declare module` typing (Tiptap). Answers services (`vcs`), parent and child, and the hub-versus-coding conflict the server now checks by hand. _Cost: small on top of 1, about 1 day._
6. **Buckets plus `before`/`after` names, not numeric priorities** (CodeMirror `Prec`, Lexical `BEFORE_`, Tapable `before`, Emacs's warning on extremes). Outermost bucket reserved for Bica's timing and summary wrappers. _Cost: small, part of 1._
7. **An interceptor on every hook** (Tapable). Timing, "who changed this call's arguments", error counts, and auto-disable after repeated failures, shown in an extension inspector in Settings. Replaces the special-cased `timeTools()` wrapping. _Cost: small to medium, 1–2 days with the UI._
8. **Static manifest, lazy code** (lazy.nvim triggers, CodeMirror `appendConfig`, Durable `deferred` tools). The palette, slot titles, and file-type routing work from manifests; `client.tsx` loads on first use; big tool sets are deferred. Matters most on the phone. _Cost: medium, 2 days, best done when the UI loader is first built rather than after._
9. **Disposable, isolated UI registration** (Lexical `register` cleanup, CodeMirror's crashed view plugin disabled, Solid roots). One Solid root per extension; a throwing contribution is replaced by the built-in and listed as failed; reload remounts only that extension. _Cost: small, part of the UI loader._
10. **Named, introspectable wraps** (Emacs advice over Slate's anonymous wrappers). `around`, `filter-args`, `filter-return`, `before-while`, each with a name, listable and removable, for tools, sections, and slot renderers. _Cost: small, mostly naming and a list in Settings._

Left out on purpose: ProseMirror's recreate-all view plugins, Tiptap's mutable storage, Lexical's legacy priority ladder and `init` phase, CodeMirror's three kinds of transaction filters, Tapable's eleven hook classes, and Emacs-style advice on internals as a public API.

## Sources

- ProseMirror: [guide, plugins](https://prosemirror.net/docs/guide/#state.plugins), [reference, PluginSpec](https://prosemirror.net/docs/ref/#state.PluginSpec), [prosemirror-state `state.ts`](https://github.com/ProseMirror/prosemirror-state/blob/master/src/state.ts), [prosemirror-view `index.ts`](https://github.com/ProseMirror/prosemirror-view/blob/master/src/index.ts).
- CodeMirror 6: [system guide](https://codemirror.net/docs/guide/#extension), [configuration example](https://codemirror.net/examples/config/), [reference](https://codemirror.net/docs/ref/#state.Facet^define), [`facet.ts`](https://github.com/codemirror/state/blob/main/src/facet.ts).
- Lexical: [commands](https://lexical.dev/docs/concepts/commands), [listeners](https://lexical.dev/docs/concepts/listeners), [node replacement](https://lexical.dev/docs/concepts/node-replacement), [extensions](https://lexical.dev/docs/extensions/intro), [defining extensions](https://lexical.dev/docs/extensions/defining-extensions), [peer dependencies](https://lexical.dev/docs/extensions/peer-dependencies), [signals](https://lexical.dev/docs/extensions/signals), [`LexicalBuilder.ts`](https://github.com/facebook/lexical/blob/main/packages/lexical-extension/src/LexicalBuilder.ts).
- Tiptap: [extension API](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/extension), [extend existing](https://tiptap.dev/docs/editor/extensions/custom-extensions/extend-existing).
- Slate: [plugins](https://docs.slatejs.org/concepts/08-plugins).
- Emacs Lisp manual: [Setting Hooks](https://www.gnu.org/software/emacs/manual/html_node/elisp/Setting-Hooks.html), [Advice Combinators](https://www.gnu.org/software/emacs/manual/html_node/elisp/Advice-Combinators.html), [Minor Modes](https://www.gnu.org/software/emacs/manual/html_node/elisp/Minor-Modes.html); read from [modes.texi](https://github.com/emacs-mirror/emacs/blob/master/doc/lispref/modes.texi) and [functions.texi](https://github.com/emacs-mirror/emacs/blob/master/doc/lispref/functions.texi), since gnu.org refused the fetch.
- lazy.nvim: [spec](https://lazy.folke.io/spec), [lazy loading](https://lazy.folke.io/spec/lazy_loading), [merge rule in lazy.nvim.txt](https://github.com/folke/lazy.nvim/blob/main/doc/lazy.nvim.txt), [`core/plugin.lua` values merge](https://github.com/folke/lazy.nvim/blob/main/lua/lazy/core/plugin.lua).
- Rollup: [plugin development](https://rollupjs.org/plugin-development/). Vite: [plugin API](https://vite.dev/guide/api-plugin).
- Tapable: [README](https://github.com/webpack/tapable).
- Pi Durable, installed copy: `node_modules/@earendil-works/pi-durable/README.md` (Extensions, Per-Conversation Agent, Settings, Reload, Hooks, Your Own State), and `dist/harness/types.d.ts` and `dist/harness/tool.js` for how hooks combine.
- Bica: `docs/explorations/extensions.md`, `src/server/agent/harness.ts`, `src/server/profiles/registry.ts`, `src/server/profiles/common.ts`, `src/lib/profiles.ts`.

Not checked: how Durable orders an extension added with `{ add }` relative to the host default (likely appended), and whether `afterTool` hooks chain each other's results or each sees the original. Both decide details of ideas 1 and 2 and are worth a five-minute test.
