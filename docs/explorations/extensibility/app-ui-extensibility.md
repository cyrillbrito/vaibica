# How extensible apps structure their UI, and what Bica should take

Research for turning Bica into a small core with most features as extensions. It covers UI extension points, registries, ids and overrides, order, dependencies, enable and disable, settings, styling, crash isolation, and testing, across Obsidian, VS Code, JupyterLab/Lumino, Backstage, AG Grid, tldraw, Grafana, Theia/Eclipse, Ghostty, Zed, Raycast, Claude Code mods, and the VS Code forks. It starts from the existing plan in `docs/explorations/extensions.md` and puts most of its weight on what that plan misses.

## Short answer

The existing plan picks the right base: Obsidian's model of plain code in named places, JupyterLab's rule that built-ins use the same API, and a `next()` chain for wrapping, as in Claude Code mods. It leaves out the parts that every mature system needed later, often at great cost:

1. **A data-first contribution record.** In every system that lasted, a contribution is a plain record with an id, a target slot, metadata, and a lazy `load()`. In the plan it is an imperative call. Records give you laziness, a list of what each extension adds, disabling by id, and overriding by id. VS Code, Backstage, Grafana, and JupyterLab all have this. Obsidian lacks it, and its 1.7.2 switch to deferred views broke plugins because it had no such layer.
2. **A server↔client channel per extension.** The plan loads `client.tsx`, but it never says how a Todos panel gets its todos. Bica already has the answer: one socket with requests and topics, and Pi Durable documents for state. Expose those to extensions, namespaced by extension id, and add one generic "document" topic. That topic gives "custom session state shown in the UI" almost for free.
3. **Sharing Solid via `window.__bica` is wrong for compiled JSX.** Solid's compiler emits ES `import`s from `@solidjs/web`, not global lookups. Bare imports have to resolve to the host's exact module instance in dev, where Vite serves pre-bundled deps under hashed URLs, and in the build. This is Obsidian's `external: ['obsidian', ...]` list and JupyterLab's `sharedPackages: { singleton: true }`. Bica needs the same, done with an import map or with the server rewriting imports to a runtime module.
4. **Order, scoping, and settings are missing.** Order should use ranks plus tiers. Scoping should use a `when` context of profile, project, route, and device. Settings should be a schema-declared form. A cleaner version of what the notes call profiles falls out of this: **a profile is an extension pack plus settings**, as VS Code profiles are.
5. **Crash isolation in one DOM is weaker than the plan implies.** `Errored` catches errors in rendering and computations. It does not catch event handlers, timers, promise rejections, or a hung main thread. Serving each extension from its own URL lets Bica blame errors by stack trace. Auto-disabling after repeated crashes, plus a browser safe mode, covers the rest. An extension that freezes the main thread can't be isolated in the page, and that is the trade VS Code refused to make.

---

## What the existing plan gets right, wrong, or leaves out

| Plan says | Verdict | Why |
| --- | --- | --- |
| Built-ins use the same slots and services | Right | JupyterLab and Backstage prove it keeps the API complete. Keep built-ins in the main bundle and register them statically. Only third-party code needs `import()`. |
| No iframes, no sandbox | Right for one author | Obsidian and Claude Code mods do the same. VS Code and Grafana's sandbox show the cost of the alternative. |
| `bica.slot('x').add / replace / wrap` | Half right | The verbs are good. They need a record shape with an id, a target, an order, a `when`, and a lazy component, plus a rule for two extensions replacing the same id. |
| Crash stays in its slot, built-in takes over | Partly | Holds for render errors only. Needs try/catch around every callback Bica calls, blame by URL, and auto-disable. |
| Share Solid through `window.__bica` | Wrong mechanism | Compiled Solid imports from modules. Use an import map or rewrite imports to a host runtime module. |
| Server compiles `client.tsx` with Solid's compiler and Tailwind | Right, add details | Compile with the host's own `@solidjs/babel-plugin` and Tailwind, so versions can't drift. Compile Tailwind without preflight, against the host `@theme`. Render client-only, since the app hydrates (`ssr: true`) and extensions load after hydration. |
| Services, such as `vcs` | Under-specified | Needs typed tokens with `requires`/`optional`/`provides` (Lumino) or exports (VS Code). Otherwise extensions talk through globals. |
| Per-session `configure({ extensions })`, agent side only | Incomplete | The UI half needs scoping too: the same pack selection, through a `when` context. |
| Nothing on settings, order, ids, versioning, testing | Missing | See below. |
| "Other UI slots once the layout settles" | Risky order | Freeze the slot contract (props, size budget, phone behaviour) per slot as each one opens. Obsidian's deferred-views breakage came from changing a contract that was never written down. |

---

## Obsidian

### How it works

- **Lifecycle with automatic cleanup.** A plugin is a `Plugin`, which extends `Component`. `onload()` registers everything. Every `register*` call (`registerView`, `registerEvent`, `registerDomEvent`, `registerInterval`, `addCommand`, `addSettingTab`, `addRibbonIcon`) is undone when the plugin unloads. `addChild()` nests components, and unloading a parent unloads its children. Disabling a plugin is `unload()`, with no restart.
  ```ts
  export default class P extends Plugin {
    async onload() {
      this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf));
      this.registerEvent(this.app.workspace.on('file-open', f => …));
      this.addCommand({ id: 'do-it', name: 'Do it', callback: () => … });
    }
  }
  ```
- **Workspace, leaves, views.** The workspace is a tree of splits and tabs, and the left and right sidebars are leaves too. A view type is a string id and a factory. Obsidian creates instances itself and warns plugins never to hold references: "Obsidian may call the view factory function multiple times… use `getLeavesOfType()`". Since 1.7.2, every view starts as a `DeferredView` and becomes real only when its tab is visible. Plugins that read `leaf.view` without an `instanceof` check broke.
- **Shared API.** Plugins import `obsidian`, which is the app's own copy. The sample plugin's esbuild config marks `obsidian`, `electron`, all of `@codemirror/*`, and `@lezer/*` as external. Bundling a second CodeMirror breaks editor extensions.
- **Settings.** `loadData()`/`saveData()` keep one JSON file per plugin. From 1.13, `PluginSettingTab.getSettingDefinitions()` is declarative: `{ name, control: { type: 'text', key: 'sampleValue' } }`, and Obsidian reads, writes, and saves with no `onChange` plumbing.
- **Styling contract.** The documented CSS variables (`--background-primary`, `--h1-color`, …, grouped by foundations, components, editor, window) are the contract. Themes are a `theme.css` that sets variables under `.theme-dark` and `.theme-light`. CSS snippets are loose `.css` files in `.obsidian/snippets`, each with a toggle, applied live on save.
- **Enable and safe mode.** Community plugins are off by default ("Restricted mode"). Installed plugins stay on disk but are ignored. Each plugin has a toggle, and a refresh icon reloads them all. There is no permission system: "Obsidian cannot reliably restrict plugins to specific permissions."
- **How conflicts happen in practice.**
  - Prototype patching. With no wrap API, plugins monkey-patch internals. `monkey-around` exists to make patches stackable and removable, and it has a `dedupe(key, …)` so that two plugins applying "the same" patch run it once.
  - Private API drift. Plugins reach into undocumented internals, and updates break them. Two recent examples: 1.12.7 changed a private `renderInstalledPlugin` and broke obsidian-terminal, and 1.7.2's deferred views broke obsidian-custom-sort.
  - Global CSS collisions. Everything shares one DOM and its class names.
  - Load-order assumptions. Plugins that touch the workspace before `onLayoutReady`.

### Borrow

- `register*` auto-cleanup, done the Solid way: run each extension's `activate` inside `createRoot(dispose => …)`, so every registration is owned and `onCleanup` undoes it. Disabling is `dispose()`.
- Factories, not instances: a slot creates and destroys contribution instances, and extensions find them through the registry.
- Shared modules as externals: one list of modules the host provides.
- Declarative settings definitions.
- CSS variables as the styling contract, plus a snippets folder with toggles.
- Restricted mode by default for project extensions.

### Avoid

- No wrap or override API, which forces monkey-patching. Bica's `wrap` with `next()` is the fix. Add a `dedupe`-like rule: the same wrapper id applied twice runs once.
- An undeclared "private API" that everybody uses anyway. Name the escape hatch (`bica.internal`) and mark it unstable, as VS Code does with proposed APIs.
- Changing lifecycle semantics without a contract. Design deferral in from day one.

Links: [Anatomy of a plugin](https://docs.obsidian.md/Plugins/Getting+started/Anatomy+of+a+plugin) · [Component](https://docs.obsidian.md/Reference/TypeScript+API/Component) · [Views](https://docs.obsidian.md/Plugins/User+interface/Views) · [Defer views](https://docs.obsidian.md/plugins/guides/defer-views) · [Settings](https://docs.obsidian.md/Plugins/User+interface/Settings) · [CSS variables](https://docs.obsidian.md/Reference/CSS+variables/CSS+variables) · [CSS snippets](https://help.obsidian.md/snippets) · [Plugin security](https://obsidian.md/help/plugin-security) · [sample esbuild config](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/esbuild.config.mjs) · [monkey-around](https://github.com/pjeby/monkey-around) · [custom-sort broke on 1.7.2](https://github.com/SebastianMC/obsidian-custom-sort/issues/160) · [terminal broke on private API](https://github.com/polyipseity/obsidian-terminal/issues/157)

---

## VS Code

### How it works

- **Contribution points are declarative and lazy.** `package.json#contributes` declares commands, menus, views, view containers, configuration, keybindings, and themes. VS Code renders them before any extension code runs. Code loads on an activation event: `onView:id`, `onCommand:id`, `onLanguage`, `workspaceContains`, `onStartupFinished`, or `*` (discouraged). Since 1.74, contributed views and commands activate their extension implicitly. One `activate()` per extension, called once, plus an optional `deactivate()`.
- **Menus have ordering built in.** `"group": "navigation@1"`: groups sort lexically, `navigation` always comes first, and `@n` orders within a group. Default groups like `1_modification` and `9_cutcopypaste` leave gaps for others.
- **`when` clauses.** Each menu item, view, and keybinding has a boolean expression over context keys (`editorLangId == typescript`, `scmProvider == git`, `view == myView`, `viewItem =~ /^file/`). Extensions add keys with `setContext`. "Inspect Context Keys" shows them live.
- **Views and containers.** `viewsContainers` adds an activity-bar icon. `views` adds a section to `explorer`, `scm`, or a custom container. Tree views are data providers (`getChildren`, `getTreeItem`), not DOM.
- **Between extensions.** `extensionDependencies` makes sure a dependency is activated first. `extensionPack` installs a bundle. `activate()` can return an API object, and other extensions read it through `extensions.getExtension('pub.name').exports`. Ids are `publisher.name`.
- **Enable and disable.** Per user or per workspace ("Disable (Workspace)"). Profiles hold their own extension set, settings, keybindings, and layout, and a folder can be tied to a profile. Workspace Trust declares `capabilities.untrustedWorkspaces: { supported: true | false | 'limited', restrictedConfigurations }`, so an untrusted folder runs extensions without workspace-supplied settings.
- **Crash isolation.** Extensions run in a separate extension host process. "This isolation guarantees that VS Code keeps running, the cursor always blinks". Extensions have **no DOM access**: "You cannot write an extension that applies custom CSS… we need the freedom to make changes to the user interface."
- **Webviews.** They exist because the native API can't draw arbitrary UI. A webview is an iframe with `postMessage`, theme colors as `--vscode-*` CSS variables, and `getState/setState`. The guidelines say to use them "only when absolutely necessary".
- **Extension bisect.** It disables half the extensions, asks "good now / still bad", and repeats, finding the culprit in O(log N) reloads. It works because enable state is a simple flag per extension.
- **API discipline.** "We DO NOT want to break API." New APIs ship as _proposed_ (`enabledApiProposals`), which works locally and can't be published.

### Borrow

- **Contributions as data plus lazy code.** Even without a JSON manifest, a contribution record (`{ id, slot, title, icon, when, order, load }`) lets Bica draw the tab or button before loading any code.
- **`when` context keys** for scoping UI contributions. Use a few keys: `profile`, `project`, `isWorktree`, `route`, `device`, `session.status`, `panel.visible`.
- **Group@order** for menus and the command palette.
- **`activate()` return value as the extension's public API**, plus a dependency list that guarantees activation order.
- **Profiles as extension sets.** This maps directly onto Bica's coding, assistant, night, and hub profiles.
- **Workspace Trust's `limited` mode**, for project extensions.
- **Bisect.** Cheap once enable state is flags. Low priority with a handful of extensions.
- **Proposed or unstable API marking** for `bica.internal`.

### Avoid

- The extension host process and no-DOM rule, for UI. They are why VS Code can't be restyled, and they defeat Bica's "a game in the centre view" test. Bica is one author, so the trade goes the other way.
- Duplicating every contribution in JSON and in code. That cost is worth paying for a marketplace, not for one person.
- `*` activation: anything that runs code at startup slows the phone's first paint.

Links: [Contribution points](https://code.visualstudio.com/api/references/contribution-points) · [Activation events](https://code.visualstudio.com/api/references/activation-events) · [When clauses](https://code.visualstudio.com/api/references/when-clause-contexts) · [Manifest](https://code.visualstudio.com/api/references/extension-manifest) · [`extensions` API / exports](https://code.visualstudio.com/api/references/vscode-api#extensions) · [Tree views](https://code.visualstudio.com/api/extension-guides/tree-view) · [Webview UX](https://code.visualstudio.com/api/ux-guidelines/webviews) · [Webview API](https://code.visualstudio.com/api/extension-guides/webview) · [Extension host](https://code.visualstudio.com/api/advanced-topics/extension-host) · [Restrictions](https://code.visualstudio.com/api/extension-capabilities/overview) · [Bisect](https://code.visualstudio.com/blogs/2021/02/16/extension-bisect) · [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust) · [Profiles](https://code.visualstudio.com/docs/editor/profiles) · [API guidelines](https://github.com/microsoft/vscode/wiki/Extension-API-guidelines) · [Proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)

---

## JupyterLab and Lumino

### How it works

- **A plugin is an object with an id and typed dependencies.**
  ```ts
  const plugin: JupyterFrontEndPlugin<IMyService> = {
    id: 'my-ext:plugin',          // package name, colon, plugin name
    requires: [ILabShell],        // missing → plugin is not activated
    optional: [ICommandPalette],  // missing → null
    provides: IMyService,         // activate()'s return value is registered under this token
    autoStart: true,              // false: activate only when someone requires the token
    activate: (app, shell, palette) => ({ … }),
  };
  ```
  A token is `new Token<T>('my-ext:IMyService')`. JupyterLab sorts activation so that providers run before consumers. Tokens must come from a deduplicated package, or the identity check fails.
- **Built-ins are plugins.** The file browser, notebook, and menus are each a package of plugins. Any of them can be disabled by id, including core ones. This keeps the public API complete.
- **Shell areas.** `top`, `menu`, `left`, `right`, `main`, `down`, `bottom`, `header`. `app.shell.add(widget, 'left', { rank: 600 })`. Rank ranges are a social contract: 0–500 first party, 501–899 third party, 900 default, 1000 the extension manager. The top bar has a spacer at rank 50, so ranks up to 50 go left and ranks above go right.
- **Disable and defer by id or pattern.** `page_config.json` has `disabledExtensions` and `deferredExtensions`, matched against a package name or a plugin id, as exact strings or regexes. Config is layered across system, sys-prefix, and user levels. An extension can disable others in its own metadata (`"disabledExtensions": ["@jupyterlab/filebrowser-extension:share-file"]`), which is how you _replace_ a built-in. Admins can lock plugins.
- **Settings.** A JSON Schema per plugin (`schema/<plugin>.json`), with user overrides and an `overrides.json` for admin defaults. The settings editor is generated from the schema.
- **Shared dependencies.** `jupyterlab.sharedPackages: { "@lumino/widgets": { singleton: true, bundled: false } }`, through module federation.
- **Advice.** Keep `activate` synchronous for auto-start plugins, because the shell attaches only after all of them ran. Move heavy imports into the command or renderer that needs them.

### Borrow

- **Typed tokens with `requires`, `optional`, and `provides`.** This is the cleanest answer to "how do extensions communicate" and "parent/children dependencies". A Git panel extension `provides: Vcs`, and a GitHub PR badge `requires: [Vcs]`.
- **Ids of the form `extension:contribution`**, so a whole extension or one piece can be disabled or replaced.
- **"Replace a built-in" = disable it by id + provide the same token.** No special replace verb is needed for services.
- **Rank ranges** documented per slot.
- **Layered disable config**: global, then project, then profile, then session.
- **Deferred activation** of plugins whose token nobody asked for yet.

### Avoid

- Module federation and a rebuild step. Bica's server compiling each extension against the host is simpler.
- Lumino widgets as the unit. Solid components are the unit.

Links: [Develop extensions (plugins, tokens, settings, sharedPackages, disabledExtensions)](https://jupyterlab.readthedocs.io/en/latest/extension/extension_dev.html) · [Extension points and shell areas](https://jupyterlab.readthedocs.io/en/latest/extension/extension_points.html) · [Managing extensions and locking](https://jupyterlab.readthedocs.io/en/latest/user/extensions.html) · [LabConfig / page_config.json](https://jupyterlab.readthedocs.io/en/stable/user/directories.html)

---

## Backstage's new frontend system

### How it works

- **The app is a tree of extensions.** Each extension has an **id**, an **attachment point** (`attachTo: { id: parent, input: 'items' }`), typed **inputs** it receives from children, typed **outputs** it gives its parent, optional **config** (zod schema), **disabled**, and a **factory**. Factories run from the leaves up, and only for enabled extensions with an enabled parent. Outputs are tagged with shared data refs, such as `coreExtensionData.reactElement` and `routePath`. A child can attach only to an input whose data refs match its outputs.
- **Ids are composed**, never typed by hand: `kind:namespace/name`, such as `page:catalog/entity` or `entity-card:catalog/about`. The kind comes from a **blueprint** (`PageBlueprint`, `NavItemBlueprint`, `ApiBlueprint`), and the namespace defaults to the plugin id.
- **Blueprints** are factories for one kind of extension: `PageBlueprint.make({ params: { path, loader: () => import('./Page').then(m => <m.Page/>) } })`. `makeWithOverrides` adds inputs and config.
- **Overrides by id.** Any extension has `.override({ factory(originalFactory, { inputs, config }) { … } })`, which can call the original, change its params, filter or reorder its inputs, or add inputs. A **frontend module** (`createFrontendModule({ pluginId: 'search', extensions: [customSearchPage] })`) ships overrides for someone else's plugin. Installing an extension with the same id replaces it.
- **App config can rewire anything**, with no code:
  ```yaml
  app:
    extensions:
      - page:catalog/entity: false            # disable
      - nav-item:search                       # enable (default-disabled ones)
      - entity-card:catalog/about:
          attachTo: { id: page:home, input: cards }
          config: { variant: compact }
  ```
  Order: enabling a default-disabled extension in config puts it at the end, so "leave extensions disabled by default if their order is important, allowing the order in which they are enabled in the configuration to determine their order".
- **Plugin vs extension vs module.** A plugin is a package with an id, owning extensions, routes, feature flags, and an `if` predicate applied to all of them. An extension is one node. A module adds or overrides extensions _inside another plugin's namespace_. Utility APIs (services) are extensions too (`ApiBlueprint`), so an app can swap any implementation.
- **`ExtensionBoundary`** wraps every extension's element in Suspense, an error boundary, and an analytics context carrying `extensionId` and `pluginId`.
- **Testing.** `createExtensionTester(ext, { apis: [[identityApiRef, mock]] }).add(other).reactElement()` boots a real mini app around one extension.

### Borrow

- **Slots are just contributions with inputs.** That makes the plan's fixed slot list open-ended: the Git panel extension defines a `git.section` input, and a VCS or PR extension attaches to it. This is the clean answer to "parent/children".
- **The composed id scheme** (`kind:extension/name`), which says what a thing is and who owns it in one string.
- **Blueprints** = Bica's per-slot helpers (`RightPanelTab.make({...})`), so each slot's props and metadata are typed in one place.
- **`override(originalFactory)`**, which is the same shape as the plan's `wrap((props, Default) => …)`.
- **Config-level enable, disable, reattach, and config, by id.** One `extensions` list in `~/.bica/settings.json`, `.bica/settings.json`, and profiles.
- **Order = order of enablement in config**, which gives the user ordering for free.
- **The boundary per contribution**, with the extension id in context for blame and logging.
- **The extension tester.**

### Avoid

- Typed data refs and attach-time validation in full. They are powerful but heavy. TypeScript types on blueprint inputs are enough for one author.
- Feature discovery through the bundler.

Links: [Extensions](https://backstage.io/docs/frontend-system/architecture/extensions) · [Overrides and modules](https://backstage.io/docs/frontend-system/architecture/extension-overrides) · [Blueprints](https://backstage.io/docs/frontend-system/architecture/extension-blueprints) · [Plugins](https://backstage.io/docs/frontend-system/architecture/plugins) · [App](https://backstage.io/docs/frontend-system/architecture/app) · [Configuring extensions](https://backstage.io/docs/frontend-system/building-apps/configuring-extensions) · [Naming patterns](https://backstage.io/docs/frontend-system/architecture/naming-patterns) · [Utility APIs](https://backstage.io/docs/frontend-system/architecture/utility-apis) · [Testing](https://backstage.io/docs/frontend-system/building-plugins/testing)

---

## AG Grid

### How it works

- **Component slots everywhere.** A column definition has `cellRenderer`, `cellEditor`, `headerComponent`, `filter`, `tooltipComponent`, and more. The side bar has `toolPanels: [{ id, labelDefault, iconKey, toolPanel, toolPanelParams }]`, with built-ins like `agColumnsToolPanel` living in the same list.
- **By reference or by name.** `cellRenderer: MedalRenderer`, or register `components: { medalRenderer: MedalRenderer }` and use `'medalRenderer'`. Names exist so that "definitions can be composed of simple types (ie JSON), which is useful should you wish to persist" them. All component kinds share one name registry.
- **A framework-free core interface.**
  ```ts
  interface ICellRendererComp {
    init?(params: ICellRendererParams): void;
    getGui(): HTMLElement;
    refresh(params): boolean; // false → grid destroys and recreates it
    destroy?(): void;
  }
  ```
  The React, Angular, and Vue wrappers adapt framework components to this. A plain function returning a DOM node works when there's nothing to clean up.
- **Params carry data plus the API back.** `params.value`, `params.data`, `params.node`, `params.api` (GridApi), `params.context` (app-supplied), and custom `cellRendererParams`. The component talks back through `api`.
- **Selectors.** `cellRendererSelector: params => ({ component, params }) | undefined` picks a renderer per row.
- **Tool panels can persist state** with `getState()` and `initialState`.

### Borrow

- **Name-based renderer lookup**, so _server_ data can choose a _client_ renderer. A tool's `details: { view: 'todo-list' }` resolves through the `transcript.tool` registry by name, falling back to tool name and then the default row. Durable's `details` channel ("for UIs") was made for this.
- **Selectors** for `transcript.tool` and `codeView`: `match(props) => boolean | number`, rather than one fixed key.
- **A lowest-level `mount(el, props) => dispose` contract** under the Solid one. It lets an extension use React, vanilla DOM, Pierre, a canvas game, or xterm without Bica caring. Solid components are the first-class path, and `mount` is the adapter.
- **Params = data + api + context**, with the same three fields in every slot.
- **Built-in panels in the same list as custom ones** (`agColumnsToolPanel`).

### Avoid

- `refresh(): boolean`. Solid's fine-grained props make it unnecessary.

Links: [Custom components](https://www.ag-grid.com/javascript-data-grid/components/) · [Cell components](https://www.ag-grid.com/javascript-data-grid/component-cell-renderer/) · [Tool panel component](https://www.ag-grid.com/javascript-data-grid/component-tool-panel/)

---

## tldraw

### How it works

- **One `components` prop maps names to overrides**, and any named UI part can be replaced or removed: `<Tldraw components={{ PageMenu: null, Toolbar: MyToolbar }} />`. `hideUi` removes everything. `onUiEvent(name, data)` reports every interaction.
- **Overrides are pure functions over the defaults.**
  ```ts
  const overrides: TLUiOverrides = {
    actions(editor, actions, helpers) {
      return { ...actions, 'my-action': { id: 'my-action', kbd: 's', onSelect: … },
               delete: { ...actions.delete, kbd: 'shift+x' } };
    },
    tools(editor, tools, helpers) { … },
  };
  ```
- **Custom shapes and tools.** A `ShapeUtil` class declares `static type`, `static props` (validators), `getDefaultProps`, `getGeometry`, and `component`, plus `migrations` for when props change. Tools are state nodes. Every record has a `meta` field for app data, which tldraw stores and syncs but never reads.
- **One huge `Editor` object**, "by design… almost everything is available through it", reactive through tldraw's signals (`useValue`, `track`).

### Borrow

- **`null` hides a part.** Disabling a built-in contribution should be that cheap, in config and in code.
- **Overrides as `(defaults) => next`** for commands, shortcuts, and menus. One function sees the whole list and can add, rebind, or drop entries, which is clearer than many small calls. It suits the command palette and the shortcuts in `docs/command-palette.md`.
- **Validated props plus migrations for extension-owned records.** Durable documents already have `version`. Add a `migrate(old, fromVersion)` convention.
- **`meta` on host records**: let extensions attach small data to sessions and projects, stored and synced by Bica, without schema changes.
- **One large reactive host API** is fine for one author. It is what makes "anything is reachable" true.

### Avoid

- Overrides as a single prop of the root component. Bica needs many independent contributors, not one integrator.

Links: [User interface](https://tldraw.dev/docs/user-interface) · [Action overrides](https://tldraw.dev/examples/action-overrides) · [Shapes](https://tldraw.dev/docs/shapes) · [Editor](https://tldraw.dev/docs/editor) · [Persistence and migrations](https://tldraw.dev/docs/persistence)

---

## Grafana

### How it works

- **Three plugin types**: panel (a visualization), data source (a connection), and app (pages, bundles of the other two, and UI extensions). `plugin.json` is required: `id` (pattern `org-name-app|panel|datasource`), `type`, `dependencies.grafanaDependency`, `includes`, `preload`, and an `extensions` block. Grafana scans plugin folders at boot and loads frontend code at runtime. App plugins load on first use unless `preload: true`.
- **UI extensions.** An extension point is a place with an id. Grafana's own are `grafana/dashboard/panel/menu` and `grafana/user/profile/tab`, and plugins prefix theirs with their own id. Plugins `addLink`, `addComponent({ targets, title, description, component })`, or `exposeComponent({ id: 'my-app/thing/v1' })`. The host renders with `usePluginComponents({ extensionPointId })` and passes props. Every contribution must also be listed in `plugin.json` so the registry can be built at boot ("Extensions are fast. We pre-build the extensions registry at Grafana boot time").
- **Protecting the host.** The `context` given to links "always gets frozen". Component props were not read-only at first, and plugins mutated objects core relied on. [PR 102079](https://github.com/grafana/grafana/pull/102079) now passes a deep clone (a Proxy can't be made deeply read-only) and logs mutations in dev. Hosts can filter by `meta.pluginId` and limit counts.
- **Versioned extension point ids**: `my-plugin/feature/v1`, then `v2` for a breaking change, with both served for a while.
- **Frontend sandbox** (preview): plugin JS runs in a separate realm through Salesforce's near-membrane, so it can't change the DOM outside its area, other plugins, or globals. It is off by default, slower, and not for Grafana's own plugins.

### Borrow

- **Versioned slot ids** (`rightPanel.tab@1`, or a `v` field on the slot). This is cheap insurance for when a slot's props change.
- **Read-only props.** Solid stores are read-only to anyone without the setter, so pass stores and accessors, never mutable objects. In dev, wrap props in a Proxy that warns on writes.
- **`exposeComponent`**: an extension can publish a component other extensions render by id. This is the UI side of tokens, for example a "diff view" that a review extension reuses.
- **Hosts filter and limit what renders in their slot.** The `topbar.action` slot decides how many show before overflow.

### Avoid

- Requiring metadata in JSON _and_ code. Grafana's docs repeat "make sure your plugin.json is up to date" on every page. That is a recurring footgun.
- A realm sandbox. It costs too much for one author, and it breaks sharing Solid's reactivity.

Links: [Plugin types](https://grafana.com/developers/plugin-tools/key-concepts/plugin-types-usage) · [plugin.json](https://grafana.com/developers/plugin-tools/reference/plugin-json) · [UI extensions concepts](https://grafana.com/developers/plugin-tools/key-concepts/ui-extensions) · [Render components](https://grafana.com/developers/plugin-tools/how-to-guides/ui-extensions/extension-user-render-component) · [Register](https://grafana.com/developers/plugin-tools/how-to-guides/ui-extensions/register-an-extension) · [Expose a component](https://grafana.com/developers/plugin-tools/how-to-guides/ui-extensions/expose-a-component) · [Versioning](https://grafana.com/developers/plugin-tools/how-to-guides/ui-extensions/versioning-extensions) · [Frontend sandbox](https://grafana.com/docs/grafana/latest/administration/plugin-management/plugin-frontend-sandbox/) · [sandbox PR](https://github.com/grafana/grafana/pull/68889)

---

## Eclipse and Theia, briefly

- **Eclipse** started the pattern: `plugin.xml` declares extension points and extensions, the registry is read without loading code, and bundles activate lazily on first use. It works, but the XML grew without end.
- **Theia** wires everything through InversifyJS dependency injection. A contribution point is an interface such as `CommandContribution`, collected through a `ContributionProvider`. A service is a `Symbol` plus an interface: `bind(GreetingRegistry).toService(GreetingRegistryImpl)`, and anyone can `rebind(GreetingRegistry).to(Mine)`. Their docs give a subtle reason to use a symbol plus an interface rather than a class as the token: a class with private members is typed nominally, so an unrelated replacement can't be assigned.
- **Borrow**: "replace a service" = rebind its token. Use interface-typed tokens, not class tokens.
- **Avoid**: decorators and a DI container. A `Map<Token, impl>` with `requires` lists does the same job.

Links: [Theia services and contributions](https://theia-ide.org/docs/services_and_contributions/)

---

## Ghostty, Zed, Raycast

### Ghostty

There are no plugins. One `key = value` file, layered by load order (later wins), with `config-file = ?optional/path` includes and live reload. Every key is also a CLI flag. The philosophy: "if you find yourself needing to configure something other than highly subjective things like the theme… open a discussion". **Borrow**: before making something an extension, ask whether a setting covers it. Layered files with optional includes suit `~/.bica` and the project `.bica`. ([config docs](https://ghostty.org/docs/config))

### Zed

Extensions are a git repo with `extension.toml`. Code is Rust compiled to WASM against a WIT interface, and only languages, themes, icon themes, snippets, debuggers, MCP and agent servers, and slash commands are supported. "There's no support for modifying the UI to create new panels." Zed calls the API limited on purpose and unfinished, with GPUI still changing. Users route around it anyway: a Discord-presence extension posed as a language server to learn which files were open. A capability system (`granted_extension_capabilities` with `process:exec`, `download_file`, and `npm:install` patterns) limits what WASM code can do. A dev extension shows "Overridden by dev extension". **Lesson**: a data-only API keeps the core free to change, but demand leaks through whatever hole exists. Bica's choice of real DOM is right for one author. **Borrow**: "Overridden by dev extension". A local folder with the same id shadows the installed one, which is how Bica should develop its own built-ins as extensions. ([blog](https://zed.dev/blog/zed-decoded-extensions) · [developing](https://zed.dev/docs/extensions/developing-extensions) · [capabilities](https://zed.dev/docs/extensions/capabilities))

### Raycast

Extensions are React, but rendered through a custom reconciler into a JSON render tree, diffed with JSON Patch and drawn natively. There is no DOM, and `react-dom` is not allowed. They run in one managed Node process, each extension in its own **worker thread** with a heap limit: "A worker can crash or run out of memory; we catch this and show an error screen for the extension". They rejected per-extension process sandboxes as too expensive. **Borrow, for Bica's server half**: the in-process risk lies on the server, not the browser. An extension tool that loops blocks every session, and a throw at import time can stop the server. Give each extension's load a try/catch and each hook a time budget. Keep worker isolation as a later option for heavy, pure server code. A Durable hook can't easily cross a worker boundary. ([how it works](https://www.raycast.com/blog/how-raycast-api-extensions-work) · [FAQ](https://developers.raycast.com/misc/faq))

---

## Claude Code mods, Claude Desktop extensions, VS Code forks

### Claude Code mods

This is the most direct prior art for Bica's UI half: an agent UI with render sites and middleware.

- **Everything is an event with middleware.** `export function register(on) { on('tool.call', { tool: 'Bash' }, async ($, e, next) => next(e)) }`. `e` is "deeply frozen plain data". To change it, pass a copy to `next`.
- **Render sites are events too.** `on('ui.render', { component: 'Spinner' }, …)`. Sites include `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `AskUserQuestion`, `Spinner`, `TurnDuration`, `PromptHint`, a `Pane` the mod opens with `$.ui.open({ id })`, and a shared `AbovePrompt` band. A hook can **change a detail** (`next({ ...e, props: { ...e.props, suffix } })`), **replace** the drawing (return its own tree), **wrap** it (`Box([await next(e), mine])`), or **leave it** (`return next(e)`).
- **Protected surfaces.** "The permission prompt isn't a render site, so a mod can't change what it shows". At `AskUserQuestion`, a tree must contain the original exactly once.
- **Validation falls back to the built-in.** A tree with an unknown element or prop makes Claude Code "draw its own version of the site", and it logs `ui.render (Pane) refused: Text prop "bogusProp" is not allowed; the engine drew its own`.
- **A `Client` element** runs a second file of the mod's own for animation and pointer input. It gets no mods API, talks by posting messages, and failures raise `ui.fault`, with a dimmed error line in its place.
- **Order by tier**: `prepend`, `user`, `append`, `builtin`, then `core`. `next.origin.tier` says who fired. `next.to(e, 'append')` can skip user mods, but only for mods in the prepend or append lists.
- **Limits**: 10 s of a hook's own time per event, 50 ms for `prompt.edit`. Exceeding it skips the hook. `.catch(handler)` per hook, with `next.error.kind` set to `throw`, `timeout`, or `re-entry`.
- **Attribution**: the VS Code panel labels drawings "From the token-chart plugin" or "Edited by the token-chart plugin".
- **Off switches**: disable one plugin, `--safe-mode` for one session, or `disableAllHooks` for everything.
- **Surfaces**: the same mod renders in the terminal, the Desktop app, and VS Code. `e.surface` and `placement: 'dock' | 'inline'` adapt the layout. Panes dock at 800 px or wider.

**Borrow**:

- The four-verb model (detail, replace, wrap, leave), with replace falling back to the built-in on error.
- Frozen inputs.
- Tiers for order.
- Per-hook `.catch` and time budgets.
- Protected surfaces. Bica's `ask` card and any confirm-before-destructive dialog should not be replaceable.
- "Edited by X" attribution in dev or on hover.
- `placement` passed to slots so one component adapts to phone and desktop.

**Avoid**:

- A JSON element tree in place of real components. They need it because the surfaces are a terminal, a desktop app, and VS Code. Bica has one surface, the browser, so real Solid components are better.

Links: [Mods overview](https://code.claude.com/docs/en/plugins/mods) · [Interface](https://code.claude.com/docs/en/plugins/mods/interface) · [Reference](https://code.claude.com/docs/en/plugins/mods/reference)

### Claude Desktop extensions (`.mcpb`, formerly `.dxt`)

These are not UI extensions. A zip bundles an MCP server with a `manifest.json` (`server.type: node | python | binary`, `user_config`), and Desktop ships the Node runtime, auto-updates bundles, and keeps secrets in the keychain. **Borrow**: a manifest field for user config that Bica renders as a form, with secrets stored apart from settings, as Bica's `auth.json` already is. ([post](https://www.anthropic.com/engineering/desktop-extensions))

### Cursor and other VS Code forks

Forks inherit the whole extension API for free, but not the marketplace. Microsoft's licence limits its marketplace and closed extensions to its own products. In April 2025 the C/C++ extension began refusing to run in forks, and Pylance and Remote had done so earlier. Cursor moved to Open VSX with its own audited builds. **Lesson for Bica**: whoever owns the registry and the important extensions owns the ecosystem. Bica's extensions should be plain folders or npm packages and git repos, with no Bica-hosted registry. That matches the `vaibica` npm scope already reserved. ([The Register](https://www.theregister.com/software/2025/04/24/microsoft-subtracts-c/c-extension-from-vs-code-forks/721912) · [Cursor extensions](https://cursor.com/help/customization/extensions))

---

## Patterns across all of them

| Concern | Common answers | Pick for Bica |
| --- | --- | --- |
| Identity | `publisher.name` (VS Code), `pkg:plugin` (Jupyter), `kind:ns/name` (Backstage), `plugin-id/point/v1` (Grafana) | Extension id `todos`. Contribution id `<slot-kind>:<ext>/<name>`, such as `rightPanel.tab:core/files` or `transcript.tool:todos/list`. |
| Override | Same id wins (Backstage, Durable tools), disable plus provide (Jupyter), rebind (Theia), `override(original)` (Backstage), `next()` (mods) | Same id replaces, with the higher tier winning, then later install order. `wrap` composes with `next`. Disable by id in config. |
| Order | Rank ranges (Jupyter), `group@n` (VS Code), config order (Backstage), tiers (mods) | `order` number with documented ranges per slot. Tiers for wrap chains (`prepend`, `user`, `builtin`). Config can reorder. |
| Dependencies | Tokens (Jupyter, Theia), `extensionDependencies` plus exports (VS Code), `attachTo` tree (Backstage) | Typed tokens with `requires`, `optional`, and `provides`. Slots are contributions, so the tree comes free. |
| Laziness | Activation events, `onView` (VS Code), deferred views (Obsidian), `loader` (Backstage), `autoStart: false` (Jupyter) | Contribution metadata is eager. The component is `load: () => import(...)`, run when the slot first shows it. |
| Enable and disable | Per workspace and profile (VS Code), `page_config` (Jupyter), `app.extensions` (Backstage), toggles (Obsidian) | Ids in layered config: global, then project, then profile, then session. Packs as profiles. |
| Scope | `when` (VS Code), `if` (Backstage) | A `when(ctx)` function over a small reactive context. |
| Settings | Declarative definitions (Obsidian 1.13), JSON Schema (Jupyter), zod (Backstage), `user_config` (mcpb) | A TypeBox schema (already in the stack through pi-ai). Bica renders the form, layered like extension config. |
| Styling | CSS variables (Obsidian, VS Code webviews), no custom CSS (VS Code) | Design tokens as CSS variables and Tailwind theme, plus the UI kit. Built-in class names are not a contract. Snippets folder. |
| Crash isolation | Process (VS Code), worker (Raycast), realm (Grafana sandbox), error boundary (Backstage), validate and fall back (mods) | A boundary per contribution, wrapped callbacks, blame by URL, auto-disable, safe mode. Time budgets on the server. |
| Testing | Extension tester (Backstage), dev validation messages (mods), Inspect Context Keys (VS Code) | A fixture extension per slot in `test:bun`, a slot gallery page, and an Extensions page with live state. |

---

## Bica in these terms

### Vocabulary

Bica needs four words, and no more:

- An **extension** is a folder or package with an id. It has an optional `server.ts` and an optional `client.tsx`, settings, and an enable state. It is what you install, toggle, and trust.
- A **contribution** is one record an extension adds to a slot. It has an id, metadata, `when`, `order`, and a lazy component or a value. It is what you override, reorder, or hide.
- A **slot** is a named place that renders the contributions attached to it, with a typed props interface and a size budget. Slots are contributions too, so extensions can define new ones.
- A **service** is a typed token with one implementation, such as `Vcs`, `Workspace`, `Sessions`, `Commands`, `Theme`, or `Socket`. A provider registers it and consumers require it.

A **pack** is a list of extension ids plus settings. Profiles become packs (see Scoping). Backstage's "module", an extension that only overrides another's contributions, needs no new word: it is an extension whose contributions reuse another extension's ids.

### Shape of an extension

```
~/.bica/extensions/todos/
  package.json        # { "name": "todos", "bica": { "api": 1 } }  (or bica.json)
  server.ts           # Pi Durable extension + Bica host half
  client.tsx          # UI half
  styles.css          # optional, Tailwind against Bica's @theme
```

```ts
// server.ts
import { defineExtension, defineDoc, defineTool, section } from '@earendil-works/pi-durable';
export const Todos = defineDoc<{ items: { text: string; done: boolean }[] }>({
  kind: 'todos.list', version: 1, scope: 'conversation', history: 'rewindable', fork: 'current',
  initial: () => ({ items: [] }),
});
export default (host) => {
  host.agent(defineExtension({ name: 'todos', tools: [todoTool], sections: [todoSection] }));
  host.doc(Todos);                       // the browser may subscribe to it, read-only
  host.request('toggle', async ({ conversationId, index }) => { … }); // ext:todos/toggle
};
```

```tsx
// client.tsx
import { RightPanelTab, TranscriptTool, useDoc } from 'bica';
export default (bica) => {
  bica.add(RightPanelTab.make({
    name: 'list', title: 'Todos', icon: ListIcon, order: 600,
    when: (ctx) => ctx.route === 'session' && ctx.profile !== 'hub',
    load: () => import('./TodoPanel'),           // props: { session, workspace, api, placement }
  }));
  bica.add(TranscriptTool.make({ name: 'list', match: (p) => p.tool === 'todo', load: () => import('./TodoRow') }));
};
```

Both halves default-export one function that receives a host object. Every registration is owned by that call and undone when the extension is disabled or reloaded. On the server that is a list of disposers. In the browser it is a `createRoot` owner.

### The slot catalogue

The list below follows today's layout (`Sidebar.tsx`, `Inspector.tsx`, `TopBar.tsx`, `Composer.tsx`, `ToolCalls.tsx`, settings routes). Every slot passes `{ ...data, api, ctx, placement }`. `ctx` is the reactive scope context, and `placement` is `'desktop' | 'phone'` plus the available width. Size budgets are part of the contract.

| Slot id | Holds | Props (data part) | Budget, and phone | Built-ins that would register here |
| --- | --- | --- | --- | --- |
| `sidebar.section` | Sections of the left column | `ctx` | Full width, collapsible header. Phone: the drawer | Projects and worktrees, sessions list, hub link, TonightStrip |
| `sidebar.filter` | Session-list filters and groupings | `sessions` (store) → `predicate` or `group` | One chip each, overflow into a menu | Status filters, profile filter, "needs you" |
| `session.badge` | Small marks on a session row and title | `session` | 16 px icon or ≤ 6 chars. Max 2 shown | Status dot, PR badge, night, assistant, context nag |
| `center.view` | Whole-page views by route | `params` | Full centre. Must work at 390 px | Session transcript, terminal, project page, hub, settings |
| `rightPanel.tab` | Tabs in the workspace panel | `workspace`, `session?` | Tab: icon plus ≤ 10 chars. Phone: a sheet | `files`, `git` (today the hard-coded `Tab = 'files' \| 'git'`) |
| `git.section` (defined by the git extension) | Parts of the Git panel | `status` | Panel width | Change list, commit box, PR badge |
| `codeView` | Viewer for a file type | `path`, `content`, `language` | Full view | Pierre code view, image, markdown preview |
| `transcript.tool` | Row for a tool call | `call` (name, args line, status, timing, `details`), `open`, `detail()` | One line collapsed, any height open | bash, read, edit diff, web, ask card, session tools |
| `transcript.message` | Wrap a user or assistant message | `message` | Width of the transcript | Markdown reply, error reply |
| `composer.action` | Buttons and menus in the composer | `draft` (read), `api.insert()`, `api.send()` | Icon only. Phone: overflow | Model picker, context field, voice, attach image |
| `composer.above` | Strip above the composer, shared | `session` | ≤ 2 lines, stacked | Queue, ReviewBar, CallBar, ContextNag, ParentStrip |
| `topbar.action` | Icons in the top bar | `ctx` | 32 px icon. Max 3 before overflow | Context meter, archive, open in editor |
| `settings.section` | Settings pages | `settings` (store), `api.save()` | Settings column | Providers, proxy, voice, models, git habits. Plus a generated form per extension schema |
| `command` | Command-palette commands and shortcuts | none: `(defaults) => commands` override style | n/a | Every ⌘K entry |
| `home.section` | Blocks on the home page | `ctx` | Full width | StartComposer, HomeTips, WorkspaceOverview |
| `session.state` | Custom per-session state shown in the UI | a Durable doc subscribed through `useDoc` | Renders inside one of the slots above | Context usage, night status, notes |

"Custom session state shown in the UI" is not a slot of its own. It is an extension-owned Durable document, a generic `doc` topic that streams it, and any slot that renders it. `projection.ts` already treats state this way.

Protected, not replaceable (mods' rule): the `ask` card's answer controls, archive and delete confirmations, and the trust prompt for project extensions. They can be wrapped (`next` must appear exactly once) but not replaced.

### Ids and overriding

- Ids are composed, never typed whole: `<slotKind>:<extension>/<name>`. Built-ins use the extension id `core`, or one extension per feature: `git`, `files`, `voice`, `night`, `hub`. Splitting by feature is better, because "remove voice" then means disabling one id.
- **Replace** = add a contribution with the same id from another extension. When two non-core extensions claim one id, the higher tier wins, then the later install order, and the Extensions page shows a warning. This is Durable's own rule for same-name tools, which keeps one mental model on both sides.
- **Wrap** = `bica.wrap('rightPanel.tab:files/tree', (props, Next) => <Frame><Next {...props} /></Frame>)`. The chain runs by tier: `prepend`, then `user`, then `builtin`, then the original. If a wrapper or replacement throws, the boundary renders `Next` (the built-in) and blames the extension.
- **Hide** = `false` in config for that id, or `bica.hide(id)` (tldraw's `null`).
- **Dedupe**: the same wrapper id registered twice runs once (`monkey-around`'s `dedupe`).

### Order

- Each slot documents rank ranges, as JupyterLab does: 0–499 core, 500–899 extensions, 900 default, and the slot's "more" or overflow entry at 1000.
- Config order wins over ranks: a slot's `order: ['rightPanel.tab:git/panel', 'rightPanel.tab:todos/list']` list in settings, as Backstage orders by enablement.
- Wrap and middleware chains order by tier, then install order. On the agent side that is Durable's install order, and the loader installs built-ins first, which the plan already says.

### Dependencies and communication

Three channels, in order of preference:

1. **Services by token**, in the same half: `const Vcs = token<VcsService>('git:vcs')`. An extension declares `provides: Vcs` or `requires: [Vcs]`, and `optional` gives `undefined`. The loader sorts activation by tokens and skips, with a message, an extension whose required token is missing or whose provider failed. Replacing git with another VCS = disable `git` and provide `Vcs` from `jj`.
2. **Commands** by id (`bica.commands.run('git:commit')`). This is the loosest coupling, and the palette, shortcuts, and other extensions all reach the same entry points. It is VS Code's `executeCommand`.
3. **State**, between halves and across tabs: Durable documents for per-conversation state, extension topics for the rest, and requests for actions. Namespace all of it: `ext:<id>/<name>` on the existing socket table in `socket.ts`. Keep the rule from `realtime-communication.md`: **the browser renders from state, never from "something happened" events**. No global event bus for extensions. That rule is why Bica reconnects correctly, and an event bus would quietly break it.

`activate()`'s return value as a public API (VS Code) is the same as `provides` with an implicit token. Pick tokens alone so there is one way.

### Extension-owned state and data

- **Per session**: a Durable `defineDoc` with `scope: 'conversation'`. It rewinds and forks with the conversation, commits with entries, survives restarts, and costs no schema change in Bica. Add `host.doc(Doc)` to allow-list it for the browser, `useDoc(Doc, conversationId)` in the client (a topic over `harness.watchDoc()`), and a `migrate` convention keyed on `version` (tldraw's shape migrations).
- **Settings**: a TypeBox schema in the extension, rendered as a form under Settings → Extensions → `<id>`. Values live in `settings.json` under `extensions.<id>`, with project overrides in `.bica/settings.json`. Secrets go to `auth.json`. Untrusted projects can't set settings marked `restricted` (VS Code's `restrictedConfigurations`).
- **Anything else**: a folder `.data/extensions/<id>/` that the extension owns, or small `meta` on host records. Give sessions and projects a `meta: Record<extId, Json>` that Bica stores and syncs but never reads (tldraw).

### Loading UI code

Ordered by what to build first:

1. **One copy of Solid.** Compiled Solid JSX imports `@solidjs/web` helpers (`template`, `insert`, `effect`, …) and `solid-js`. These must be the host's module instances, or signals, context, and owners won't connect. Two ways:
   - The server rewrites bare imports while bundling each extension (Bun.build with these as externals), turning `solid-js` into `/ext-runtime/solid-js.js`. No import map is needed.
   - Or an `<script type="importmap">` in `Document.tsx`, mapping `solid-js`, `@solidjs/web`, `solid-js/store`, and `bica` to the runtime URLs. It must be in the HTML before any module script runs.

   Either way, `/ext-runtime/*` must be the _same instance the app uses_. In dev, serve small shims through Vite (`export * from 'solid-js'`), which Vite rewrites to the same pre-bundled `/node_modules/.vite/deps/solid-js.js?v=…` the app uses. In the build, add these shims as extra entries with `preserveEntrySignatures: 'strict'`, so Rollup keeps Solid in one shared chunk that both import. `bica` (the extension API and the UI kit: `Button`, `IconButton`, `Empty`, `Failed`, icons, `Markdown`, `CodeView`) is just another runtime entry. This replaces `window.__bica`.

2. **Compile with the host's compiler.** Use `@babel/core` and `@solidjs/babel-plugin` from Bica's own `node_modules`, the same ones `@solidjs/vite-plugin` uses, with `generate: 'dom'` and no hydration. Extension UI renders client-only after the app hydrates, inside a boundary. The page renders an empty shell anyway (`realtime-communication.md`), so this costs nothing visible. Cache by content hash, and serve `/ext/<id>/<hash>.js` with immutable caching. On the phone, a cached extension is then free after the first load.
3. **Lazy by default.** Contribution records are cheap, but their `load()` runs only when the slot first shows them (Backstage `loader`, Obsidian deferred views, VS Code `onView`). Built-ins stay in the main bundle or Vite chunks as today, so they cost no extra request.
4. **Hot reload.** The server watches the extension folders. On change, it disposes the old owner, reinstalls the Durable extension under the same name (live replace is built in), and pushes the new hash on a `extensions` topic. Each tab re-imports and re-activates, and slots re-render from the reactive registry. Durable's rule applies: "work that already started keeps the code it took".

### Solid, React, anything

- Keep Solid as the slot contract. Sharing reactivity is the reason to run in the page at all, and it is what Bica uses everywhere.
- Add a `mount` escape hatch at the bottom, `{ mount(el: HTMLElement, props): () => void }` (AG Grid's `getGui`/`destroy`), with a tiny adapter `fromMount(spec)` that turns it into a Solid component (a `ref`, then `onCleanup(dispose)`). Props stay reactive, and the extension reads them in its own effect.
- React would be an adapter on top of `mount`, `fromReact(Component)`, which creates a React root in the element and re-renders on prop changes. It costs react and react-dom only for the extensions that use it, loaded lazily. Don't make React a first-class contract. Two runtimes in one transcript, with contexts that can't cross, is the trap.

### Styling contract

- The contract is the design tokens in `docs/UI.md` as CSS variables, and the Tailwind theme built on them (`bg-panel`, `text-muted`, `border-line`, `bg-active`, `touch:` variant). Compile extension CSS with the host's Tailwind and `@theme`, **without preflight**, in a `@layer ext` after Bica's utilities. Identical utilities then come out identical, and an extension can't restyle the base layer by accident.
- Built-in class names and DOM structure are **not** a contract (VS Code's rule). Overriding goes through `wrap` and `replace`, not CSS selectors on Bica's markup.
- Add a `~/.bica/snippets/*.css` folder with a toggle each, applied live (Obsidian). It is the cheapest way to change a look without an extension.
- Light, dark, and editor themes (`docs/explorations/themes.md` in the repo) set the same variables, so extensions follow themes for free.

### Crash isolation

- **Render**: every contribution renders inside `<Errored fallback={…}>` plus `<Loading>`, which together play the role of Backstage's `ExtensionBoundary`, with the contribution id in context. For `replace` and `wrap`, the fallback is the next item in the chain, ending at the built-in. For `add`, it is a one-line "`todos` failed: message · Retry · Disable".
- **Callbacks**: everything Bica calls on an extension's behalf runs through `guard(extId, fn)`. That covers commands, `when`, `match`, predicates, settings `onChange`, and request handlers. A throw is logged with the id and treated as "no result" (`when` false, `match` false).
- **What `Errored` can't see** (event handlers, timers, promise rejections): listen to `window` `error` and `unhandledrejection`, and blame by stack URL. Each extension is served from `/ext/<id>/…`, so the frame tells you whose it was. Obsidian's stacks show `plugin:terminal` for the same reason.
- **Auto-disable**: three failures in a minute disables the extension for this browser and shows a notice with "Re-enable". Persist it, so a crash loop can't lock you out.
- **Safe mode**: `?safe` on any URL loads no client extensions. `BICA_SAFE=1` loads no server extensions. Show a banner while either is on.
- **Server half** (Raycast's point): a try/catch around each extension's import and `default()`, so a broken one is skipped, not fatal. Give each hook a time budget (Claude Code mods: 10 s, 50 ms on hot paths) and log overruns with the id. Whether a Durable hook that throws fails the run or is skipped is worth checking in Durable's code and raising upstream. The plan already lists hook gaps there.
- **Not isolable, by choice**: an extension that freezes the main thread or leaks memory in the browser. That is the trade VS Code made the other way. Accept it, and catch it with the Extensions page's load timings.

### Enable, disable, and scoping

- **Layered config**, later wins, as Ghostty, JupyterLab, and VS Code do: built-in defaults, then `~/.bica/settings.json` `extensions`, then the trusted project's `.bica/settings.json`, then the profile, then a per-session override. One format everywhere: Backstage's list of `id`, `id: false`, or `id: { config, order }`, matching both extension ids and contribution ids.
- **A profile is a pack.** Today `src/lib/profiles.ts` has `panels: true/false`, and `src/server/profiles/*.ts` lists tools and sections. As packs:
  - Coding = `core`, `files`, `git`, `terminals`, `web`, `ask`, `codemode`.
  - Assistant = Coding + `memory`, `upkeep`.
  - Night = Coding − `ask` + `night-report`.
  - Hub = `core`, `hub-tools`, `upkeep`, with no `files` or `git`, so their right-panel tabs never match, and `panels: false` falls out with no flag.

  A profile also carries settings (model, effort). The agent half resolves through `configure({ extensions })`, which the plan has. The UI half reads the same resolved list through `ctx.extensions`. A custom profile ("agent") is then just a pack file, which answers the notes' "profiles/agents as extensions".

- **`when`** covers what packs can't: route, device, `isWorktree`, session status. Keep the context small and documented, and show it live in a dev panel (VS Code's Inspect Context Keys).
- **Trust**: project extensions stay off until the project is trusted, recorded outside the repo, as the plan says. Add VS Code's `limited` idea: an untrusted project can still _disable_ things and set unrestricted settings, but can't run code.
- **Bisect**: with flags per extension, "Find the extension causing this" can halve, reload, ask, and repeat. Build it only once there are more than about 8 extensions.

### Testing the extension surface

Each item answers an open question from the notes:

- **Types.** A `bica` types entry, the same file as the runtime module, so `bun check` type-checks `~/.bica/extensions/*` against the installed API. Each slot's props interface lives in its blueprint. A breaking change bumps the slot's version (Grafana's `/v1`), and the loader warns about an extension built for an older `api`.
- **Load and unload.** A fixture extension per slot under `test/extensions/`, loaded by `bun run test:bun`. The test checks that registering adds the contribution, that disabling leaves _no_ contributions, disposers, socket handlers, or Durable extensions behind, and that reloading replaces in place.
- **Crash paths.** Fixture extensions that throw in `default()`, in render, in an event handler, and in `when`. Assert the fallback, the blame, and the auto-disable.
- **Slot space and props.** A dev-only `/dev/slots` gallery renders every slot with the built-ins plus two fixture contributions with worst-case labels (long titles, many tabs, emoji, RTL), at desktop width and at 390 px, light and dark, reusing `?data=worst`. Check it with `agent-browser`. This is Backstage's `createExtensionTester` and the Claude Code mods interface gallery, merged.
- **CSS and theme.** The gallery in each theme is the visual test. A cheap lint flags raw hex colors and `!important` in extension CSS. Don't build more than that.
- **Profiles.** A snapshot test of the resolved extension list and the visible slots per profile (coding, assistant, night, hub), so a pack change can't drop the Git tab from Coding unnoticed.
- **Live state.** Settings → Extensions lists each extension: enabled, source (core, global, project, dev override), load time, contributions with their ids, recent errors, and Disable and Reload buttons. VS Code's Running Extensions and Zed's "Overridden by dev extension" do the same job.

---

## Ranked: what to borrow first

| # | Idea | From | Cost | Why this rank |
| --- | --- | --- | --- | --- |
| 1 | **Contribution records with composed ids**, a reactive registry, built-ins registered through it, starting with `rightPanel.tab` and `transcript.tool` | Backstage, VS Code, JupyterLab | M: a registry module, a `Slot` component, turning the `Inspector` tabs and the `ToolCalls` dispatch into lookups | Everything else (override, disable, order, laziness, testing) hangs off ids and records. It can be done before any third-party loading exists. |
| 2 | **Per-contribution boundary, `guard()` on callbacks, fallback to the built-in, blame by URL, `?safe`** | Backstage, Claude Code mods, Obsidian | S: `Errored`, `Loading`, a wrapper, a `window` listener | Makes the "can't lock you out" goal true, and it is cheap. |
| 3 | **Durable documents as extension state, with a generic `doc` topic and `useDoc`** | Pi Durable, AG Grid's name lookup for renderers | S–M: one topic over `watchDoc`, an allow-list, a migrate convention | Gives "custom session state in the UI" and survives fork, rewind, and restart with no new storage. |
| 4 | **Host runtime module for Solid, the API, and the UI kit, plus a server compile with the host's Babel plugin and Tailwind** | Obsidian externals, JupyterLab singletons | M: dev shims, build entries, a Bun.build plugin, a hash cache | The plan's `window.__bica` won't work. This is the one hard technical piece of loading UI code. |
| 5 | **Profiles as packs, with layered enable config (`id`, `id: false`, `id: {…}`) and a `when` context** | VS Code profiles, Backstage `app.extensions`, JupyterLab levels | M: move `PROFILES.panels` and the profile tool lists into packs, plus one resolver used by both halves | Unifies the agent and UI halves, and answers "profiles/agents as extensions". |
| 6 | **Typed service tokens with `requires`, `optional`, and `provides`**, plus commands by id | JupyterLab/Lumino, Theia, VS Code | S: a `token()` helper and a topological sort | The answer to communication and dependencies. It enables "another VCS behind the Git panel". |
| 7 | **`wrap` and `replace` with tiers and `next()`, and protected surfaces** | Claude Code mods, Backstage `override` | S on top of #1 | The plan has the verbs. Adding tiers and protection stops conflicts and protects the ask card. |
| 8 | **Schema-declared settings rendered by Bica** | Obsidian 1.13, JupyterLab, mcpb `user_config` | S–M: a TypeBox-to-form renderer for a few control types | Every extension needs settings, and hand-built pages per extension don't scale. |
| 9 | **Slot gallery, fixture extensions, Extensions page** | Backstage tester, mods gallery, VS Code Running Extensions | M | The test harness for slot space, props, CSS, and profiles. Build it as the slots open, not at the end. |
| 10 | **`mount(el, props)` escape hatch, with React as an adapter** | AG Grid | S | Keeps "a game in the centre view" and xterm or Pierre easy, without React in the core. |

Not worth it now: a JSON manifest that duplicates code (Grafana's footgun), realm or iframe sandboxes, module federation, bisect (until there are more than about 8 extensions), and a marketplace or registry (the VS Code forks' lesson).

## Sources

- Repo: `docs/explorations/extensions.md`, `docs/architecture.md`, `docs/profiles.md`, `docs/realtime-communication.md`, `src/lib/profiles.ts`, `src/components/Inspector.tsx`, `vite.config.ts`, `node_modules/@earendil-works/pi-durable/README.md` (Extensions, Per-Conversation Agent, Reload, Your Own State), `node_modules/@solidjs/vite-plugin/package.json`, `node_modules/solid-js/CHEATSHEET.md`.
- Obsidian: [Anatomy](https://docs.obsidian.md/Plugins/Getting+started/Anatomy+of+a+plugin), [Component](https://docs.obsidian.md/Reference/TypeScript+API/Component), [Views](https://docs.obsidian.md/Plugins/User+interface/Views), [Defer views](https://docs.obsidian.md/plugins/guides/defer-views), [Settings](https://docs.obsidian.md/Plugins/User+interface/Settings), [CSS variables](https://docs.obsidian.md/Reference/CSS+variables/CSS+variables), [Build a theme](https://docs.obsidian.md/Themes/App+themes/Build+a+theme), [Snippets](https://help.obsidian.md/snippets), [Community plugins](https://help.obsidian.md/Extending+Obsidian/Community+plugins), [Plugin security](https://obsidian.md/help/plugin-security), [sample esbuild config](https://github.com/obsidianmd/obsidian-sample-plugin/blob/master/esbuild.config.mjs), [monkey-around](https://github.com/pjeby/monkey-around), [custom-sort #160](https://github.com/SebastianMC/obsidian-custom-sort/issues/160), [obsidian-terminal #157](https://github.com/polyipseity/obsidian-terminal/issues/157).
- VS Code: [Contribution points](https://code.visualstudio.com/api/references/contribution-points), [Activation events](https://code.visualstudio.com/api/references/activation-events), [When clauses](https://code.visualstudio.com/api/references/when-clause-contexts), [Manifest](https://code.visualstudio.com/api/references/extension-manifest), [API: extensions](https://code.visualstudio.com/api/references/vscode-api#extensions), [Tree views](https://code.visualstudio.com/api/extension-guides/tree-view), [Webviews UX](https://code.visualstudio.com/api/ux-guidelines/webviews), [Webview API](https://code.visualstudio.com/api/extension-guides/webview), [Extension host](https://code.visualstudio.com/api/advanced-topics/extension-host), [Capabilities and restrictions](https://code.visualstudio.com/api/extension-capabilities/overview), [Bisect](https://code.visualstudio.com/blogs/2021/02/16/extension-bisect), [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust), [Profiles](https://code.visualstudio.com/docs/editor/profiles), [Workspaces](https://code.visualstudio.com/docs/editing/workspaces/workspaces), [API guidelines](https://github.com/microsoft/vscode/wiki/Extension-API-guidelines), [Proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api).
- JupyterLab: [Develop extensions](https://jupyterlab.readthedocs.io/en/latest/extension/extension_dev.html), [Extension points](https://jupyterlab.readthedocs.io/en/latest/extension/extension_points.html), [Managing extensions](https://jupyterlab.readthedocs.io/en/latest/user/extensions.html), [LabConfig](https://jupyterlab.readthedocs.io/en/stable/user/directories.html).
- Backstage: [Extensions](https://backstage.io/docs/frontend-system/architecture/extensions), [Overrides](https://backstage.io/docs/frontend-system/architecture/extension-overrides), [Blueprints](https://backstage.io/docs/frontend-system/architecture/extension-blueprints), [Plugins](https://backstage.io/docs/frontend-system/architecture/plugins), [App](https://backstage.io/docs/frontend-system/architecture/app), [Configuring extensions](https://backstage.io/docs/frontend-system/building-apps/configuring-extensions), [Naming](https://backstage.io/docs/frontend-system/architecture/naming-patterns), [Utility APIs](https://backstage.io/docs/frontend-system/architecture/utility-apis), [Testing](https://backstage.io/docs/frontend-system/building-plugins/testing), [ExtensionBoundaryProps](https://backstage.io/api/stable/interfaces/_backstage_frontend-plugin-api.index.ExtensionBoundaryProps.html).
- AG Grid: [Components](https://www.ag-grid.com/javascript-data-grid/components/), [Cell components](https://www.ag-grid.com/javascript-data-grid/component-cell-renderer/), [Tool panels](https://www.ag-grid.com/javascript-data-grid/component-tool-panel/).
- tldraw: [User interface](https://tldraw.dev/docs/user-interface), [Action overrides](https://tldraw.dev/examples/action-overrides), [Shapes](https://tldraw.dev/docs/shapes), [Editor](https://tldraw.dev/docs/editor), [Persistence](https://tldraw.dev/docs/persistence).
- Grafana: [Plugin types](https://grafana.com/developers/plugin-tools/key-concepts/plugin-types-usage), [plugin.json](https://grafana.com/developers/plugin-tools/reference/plugin-json), [UI extensions](https://grafana.com/developers/plugin-tools/key-concepts/ui-extensions), [Render components](https://grafana.com/developers/plugin-tools/how-to-guides/ui-extensions/extension-user-render-component), [Register](https://grafana.com/developers/plugin-tools/how-to-guides/ui-extensions/register-an-extension), [Expose](https://grafana.com/developers/plugin-tools/how-to-guides/ui-extensions/expose-a-component), [Versioning](https://grafana.com/developers/plugin-tools/how-to-guides/ui-extensions/versioning-extensions), [Frontend sandbox](https://grafana.com/docs/grafana/latest/administration/plugin-management/plugin-frontend-sandbox/), [PR 68889](https://github.com/grafana/grafana/pull/68889), [PR 102079](https://github.com/grafana/grafana/pull/102079).
- Theia: [Services and contributions](https://theia-ide.org/docs/services_and_contributions/).
- Ghostty: [Configuration](https://ghostty.org/docs/config). Zed: [Life of a Zed extension](https://zed.dev/blog/zed-decoded-extensions), [Developing extensions](https://zed.dev/docs/extensions/developing-extensions), [Capabilities](https://zed.dev/docs/extensions/capabilities). Raycast: [How the API and extensions work](https://www.raycast.com/blog/how-raycast-api-extensions-work), [FAQ](https://developers.raycast.com/misc/faq).
- Claude: [Mods overview](https://code.claude.com/docs/en/plugins/mods), [Mods interface](https://code.claude.com/docs/en/plugins/mods/interface), [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference), [Desktop extensions](https://www.anthropic.com/engineering/desktop-extensions).
- Forks: [The Register on C/C++ and forks](https://www.theregister.com/software/2025/04/24/microsoft-subtracts-c/c-extension-from-vs-code-forks/721912), [Cursor extensions](https://cursor.com/help/customization/extensions).
