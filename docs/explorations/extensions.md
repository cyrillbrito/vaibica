# Extensions

This is exploration work. Nothing here is built. It compares how other apps let people extend them, and sketches what could fit Tau.

## Vision

Tau should be as open, flexible, and extensible in its UI as Pi is in its agent. Anything should be buildable as an extension. That doesn't mean every feature has to be built as one. It means nothing in Tau is out of reach: an extension can add to any part of the app, wrap it, or replace it.

Raw but powerful. Extensions get the right hooks and all the information they need, not a polished, limited API. Building something unusual should be possible even if it takes some work, rather than impossible because the API didn't plan for it.

The idea comes from JupyterLab, Emacs, and Pi itself: the app is made of the same parts an extension uses. When Tau's own features use the same slots and services as extensions, the API can't fall behind the app, and replacing a built-in feature is the same as adding a new one.

The test is whether these could be built without changing Tau's code:

- A custom file tree that replaces the default one.
- Another version control system next to git and GitButler, with the Git panel working on top of it, or with its own panel.
- A different voice mode.
- A game embedded in the center view.

If one of them can't be built, a slot or a service is missing.

## Goals

- Anyone can add a new way of working to Tau: tools and rules for the agent, and UI for the human.
- Extensions can change the UI a lot, from a new right panel tab to a different session list or a different way to draw a tool call in the transcript.
- Built-in features are replaceable. An extension can take over the file tree, the Git panel, or voice, the same way it adds something new.
- Extensions use the same language and capabilities as Tau itself: TypeScript, Solid, Tailwind, npm packages, and the real DOM. No iframes and no sandbox.
- A bad extension can't lock you out. A crash stays inside its slot, Tau's built-in version takes over, and a safe mode starts Tau with no extensions at all.
- Keep it simple. A few concepts that combine well, not a large API.
- On the agent side, lean on what Pi Durable provides and don't wrap or fight it. It is new and still changing.
- Configuration lives in Tau's own folders, `~/.tau/` for the user and `.tau/` in a project, not in Pi's.

## Two halves

An extension has an agent half and a UI half, and they are separate problems.

The agent half is mostly solved already. Pi Durable has its own extensions (`defineExtension`): tools, system prompt sections, hooks that block or rewrite tool calls and continue runs, wraps around existing tools, and durable tasks. Tau's own tools (`CodingTools`, `TerminalTools`, the web tools) are already built this way. Installing an extension again under the same name replaces it live, so reloading on save is cheap. What's missing is a loader for files in `~/.tau/extensions/` and `.tau/extensions/`. Tau's hard-coded defaults, such as the replies rules in `src/server/instructions.ts`, could move into a built-in extension to prove the design.

The UI half is the open question, and the rest of this doc is about it.

## How other apps do it

### Obsidian: full access, named places, automatic cleanup

Obsidian is an Electron app, so plugins are plain JavaScript in a browser. A plugin is a class with `onload` and `onunload`. It gets the whole app object and the real DOM, and it can import any library.

What keeps it in order is that plugins attach through named entry points: `registerView` for a panel, `addRibbonIcon`, `addStatusBarItem`, `addCommand`, `addSettingTab`, `registerMarkdownPostProcessor` for how notes render, and `registerEditorExtension` for the editor. Each `register*` and `add*` call is remembered and undone when the plugin unloads, so turning a plugin off leaves nothing behind.

Plugins can also reach past the entry points and patch internals or the DOM directly. Many do, and those are the ones that break when Obsidian updates. The plugin ecosystem is huge because the barrier is so low.

What we'd take: plain code and real DOM, named entry points, and cleanup tied to registration.

### JupyterLab: the app is made of plugins

JupyterLab goes one step further. Its own features, such as the file browser, the notebook, and the terminal, are plugins that use the same API as third-party ones. The shell has named areas (`left`, `right`, `main`, `top`, `bottom`) where plugins add widgets. Plugins ask for services by token (`requires: [INotebookTracker]`) and can provide their own, so plugins build on each other.

Because the built-in features use the public API, the API can't fall behind the app. Anything the app can do, an extension can do.

What we'd take: named areas, and building Tau's own panels through the same API so it stays honest.

### VS Code: declarations, a separate process, and webviews

A VS Code extension has a `package.json` manifest whose `contributes` section declares where it shows up: commands, menus, views in the sidebar or panel, settings, keybindings, themes, languages. Activation events (`onLanguage:python`, `onView:todos`) decide when its code loads, so unused extensions cost nothing.

The code runs in a separate extension host process and talks to the editor through a stable API. A crashing or slow extension can't freeze the editor. Built-in UI pieces, such as tree views and quick picks, are drawn by VS Code from data the extension supplies. Anything custom goes in a webview, which is an iframe.

It's the most stable model of all, and VS Code changes its internals freely without breaking extensions. The price is that extensions can't change how the editor itself looks, and webviews feel separate from the rest of the app. That's the most common complaint about it.

What we'd take: a declared list of contribution places, and loading only when needed. We'd skip the separate process and the iframes.

### Claude Code mods: redraw any site through a chain

Claude Code mods, released in October 2026, are event handlers in a plugin. They can rewrite prompts, block or retry tool calls, add `/commands`, and draw UI. Each place in the interface is a render site: a pane, the band above the prompt, a message, a tool call row, the spinner. Before drawing a site, Claude Code asks the mods what to draw there.

A mod returns an element tree built from a fixed set of elements (`Box`, `Text`, `Button`, `Markdown`, `Select`, and a few more). It can call `next(e)` to get Claude Code's own drawing and wrap it, change a detail by passing different props to `next`, or replace it. Several mods can stack on one site. A tree that doesn't validate is ignored, and Claude Code draws its own version.

The fixed element set exists because the same tree has to render in a terminal and in the desktop app. Tau only renders in a browser, so it doesn't need that layer.

What we'd take: the `next()` chain to wrap or replace built-in pieces, and falling back to the built-in drawing when an extension fails.

### Others

- Grafana and Backstage load plugins as React components that are fully trusted. That's the same model as Obsidian, applied to React apps.
- Raycast extensions are React code, but they render only Raycast's own components (`List`, `Detail`, `Form`). Every extension looks native, but none can look different.
- Zed runs extensions as WebAssembly with a narrow API: languages, themes, slash commands, and context servers. It's safe and fast, but it can't add UI.
- Figma and Logseq put plugin UI in iframes. They're safe, but cut off from the app.
- Discord mods such as Vencord patch the app's bundled code with find-and-replace on its internals. Anything is possible, and things break on every update. This is the model to avoid.
- Emacs and Neovim have no boundary at all: the user's code runs in the same runtime as the editor and can redefine anything. It's the most malleable, and it works because the user owns both sides.

### Docs to read

- Obsidian: [Build a plugin](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin), [Plugin API](https://docs.obsidian.md/Reference/TypeScript+API/Plugin), and the whole API in one file, [obsidian.d.ts](https://github.com/obsidianmd/obsidian-api). Plugins get `this.app` (vault, workspace, metadata cache), the real DOM, and Node on desktop.
- JupyterLab: [Extension points](https://jupyterlab.readthedocs.io/en/latest/extension/extension_points.html) and the [extension dev guide](https://jupyterlab.readthedocs.io/en/latest/extension/extension_dev.html). Shell areas, commands, and services by token.
- VS Code: [UX guidelines](https://code.visualstudio.com/api/ux-guidelines/overview) (every place an extension can appear), [contribution points](https://code.visualstudio.com/api/references/contribution-points), the [API](https://code.visualstudio.com/api/references/vscode-api), and [webviews](https://code.visualstudio.com/api/extension-guides/webview). Only the `vscode` API, never the editor's DOM.
- Claude Code mods: [interface](https://code.claude.com/docs/en/plugins/mods/interface) and [reference](https://code.claude.com/docs/en/plugins/mods/reference). Events and element trees, no DOM.
- Others: [Raycast](https://developers.raycast.com/), [Grafana](https://grafana.com/developers/plugin-tools/), [Figma](https://www.figma.com/plugin-docs/), [Logseq](https://plugins-doc.logseq.com/), [Zed](https://zed.dev/docs/extensions).

## Comparing the models

From most open to most strict:

- Patching internals (Vencord, Emacs): unlimited power, breaks constantly.
- Full code in named places (Obsidian, JupyterLab, Grafana): nearly unlimited power, mostly stable, crashes are shared with the app.
- Replaceable sites with a fixed element set (Claude Code mods): can change built-in UI, very stable, limited to the elements offered.
- Declared contributions plus iframes (VS Code, Figma, Logseq): very stable and isolated, can't change the app's own look.
- Data only (Raycast, Zed): native look, little freedom.

Tau is a tool for one person, who writes or reviews the extensions it runs. That makes isolation much less important than in VS Code or Figma, and it puts Tau near Obsidian, JupyterLab, and Emacs.

## A possible shape for Tau

Obsidian's model on Solid, with two ideas borrowed from the others: built-in features use the same API (JupyterLab), and built-in pieces can be wrapped or replaced (Claude Code mods). Five concepts:

- Slots are named places in the UI. An extension adds an entry to a slot, wraps an existing one, or replaces it by id. Tau's own Files tab is just the entry `files` in `rightPanel.tab`.
- Services sit behind features. Plain git and GitButler become two providers of one `vcs` service, so a third system is a new provider and the Git panel works on it unchanged.
- An extension has two halves. The server half is code in Tau's Bun process plus Pi Durable extensions, and the client half is Solid components. They talk over the existing WebSocket, in a namespace per extension.
- Extensions get full access: the same stores, signals, DOM, Solid, and npm packages Tau uses. No sandbox.
- There's always a way back. Every slot entry renders inside an error boundary that falls back to the built-in, every registration can be undone, and `?safe` starts Tau with no extensions.

An extension is a folder in `~/.tau/extensions/` or a project's `.tau/extensions/`, with a `server.ts`, a `client.tsx`, or both.

### Slots

Each slot sits on a piece of UI that already exists:

- `sidebar.section` and `sidebar.sessionRow` (`Sidebar.tsx`): other groupings, extra info per session.
- `center.view` (the `/s/`, `/t/`, and `/p/` routes): a new kind of view with its own route, such as a dashboard or a game.
- `rightPanel.tab` (`Inspector.tsx`): Files, Git, Changes, and new tabs. Replacing the file tree happens here.
- `codeView`, keyed by file type (`CodeView.tsx`, `FilePreview.tsx`): a CSV table, a notebook. Tau's own Markdown, HTML, and Mermaid previews would be entries here.
- `transcript.tool`, keyed by tool name (`ToolCalls.tsx`), and `transcript.message`: how a tool call or a message is drawn.
- `composer`, `composer.above`, and `topbar.action` (`Composer.tsx`, `ContextNag`, `Queue`, `CallBar`, `TopBar.tsx`): the prompt area and session actions. A different voice mode lives here.

In Tau, each place becomes `<Slot name="rightPanel.tab" />`, reading a reactive registry. An extension's client entry:

```tsx
export default (tau) => {
  tau.slot('rightPanel.tab').add({ id: 'todos', title: 'Todos', component: Todos });
  tau.slot('rightPanel.tab').replace('files', MyTree);
  tau.slot('transcript.tool').wrap('bash', (props, Default) => <Fancy><Default {...props} /></Fancy>);
};
```

### Loading in production

Tau is built once. Adding or changing an extension never rebuilds the app, and no dev server is needed.

- The server compiles each extension on its own with esbuild and Solid's JSX transform, caches it by content hash, and serves it as `/ext/<name>.js`. Authors can also ship a precompiled `.js`.
- The browser gets the list of extensions over the socket and loads each with `import()`.
- Extensions must share Tau's copy of Solid, or signals don't connect. The built app puts its Solid modules and the Tau API on `window.__tau`, and extensions are compiled so `import ... from 'solid-js'` reads from there. This is Obsidian's `require('obsidian')` trick. Import maps would be cleaner but need Solid kept as separate, fully exported chunks in the build.
- The server compiles with the Solid version the app was built with, so compiled JSX always matches the runtime. Precompiled extensions must target the same major version.
- Tailwind only generates classes it finds at build time, so the server also runs Tailwind over each extension and serves `/ext/<name>.css`.
- The server watches the extensions folders. On a change it recompiles and tells the browser, which undoes the old registrations and imports `/ext/<name>.js?v=<hash>`.

### Where to start

The core UI isn't settled yet. For example, Files and Git belong to a workspace while they sit next to one session, and with GitButler the changes are partly per session. Slots copied from today's layout would freeze it. So:

- Start with the agent half: load Pi Durable extensions from `~/.tau/extensions/`. It's cheap, it's what Pi already does, and it doesn't touch the UI.
- The first UI slot is `transcript.tool`, keyed by tool name. Tools come from extensions, so drawing them is the natural first need, and a tool call row is a stable idea whatever the layout becomes.
- Inside Tau, build new UI in a slot-like way (lists of entries, renderers keyed by name) without making it public. When the layout settles, opening it up is cheap.

### Open questions

- How does an extension's server half send state to its UI? It could use a Durable document per conversation, which is already durable and watched, or its own subscription.
- Project extensions run code from a repo. Pi asks for project trust before loading them, and Tau may need the same.
- Which slots come first? A right panel tab and a custom tool row would cover most of the first ideas.
- Which services come first? `vcs` is the clearest, since git and GitButler already exist side by side.
- Can Pi coding agent extensions run through a shim? Tools and simple `tool_call` hooks map onto Durable. Their terminal UI calls don't.
