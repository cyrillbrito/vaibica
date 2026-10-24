# Source layout

The layout Bica's source should have: code grouped by feature, one folder per feature holding both its server and browser code, and a few root folders that join the features into one app. It assumes Bica renders in the browser only, with no server-side rendering ([why](#server-side-rendering)).

## The rule

A file lives in the folder of the feature it serves. A file that must never reach the browser says so on its first line with `import 'server-only'`, and two checks make that hold.

## The tree

```
src/
  App.tsx  Document.tsx  router.ts   the app's root; start mode looks for them here
  protocol.ts                        every call and topic, joined from each feature's protocol.ts
  routes/                            one thin file per URL, rendering a feature's page
  app/                               the frame around pages: sidebar, ⌘K, top bar, layout, settings page, test data
  server/                            the server's root: socket router, the list of agents, data paths, startup
  socket/                            the connection both sides use: the browser client, message types, the topic cache
  ui/                                the design system and DOM helpers
  features/
    sessions/  agents/  projects/  models/  files/  git/  terminals/
    voice/  hub/  night-runs/  context-usage/  housekeeping/
  testing/
```

The layers import downward only. `ui/` and `socket/` know no features. Features import `ui/`, `socket/`, and the features they build on. The root files and folders (`protocol.ts`, `routes/`, `app/`, `server/`, `App.tsx`) import features by name and join them, and no feature imports them.

## A feature

A feature is one folder that owns everything about one capability: its pages and rows, its server code, its agent tools, its settings, and its socket calls and topics. Terminals, for example:

```
features/terminals/
  protocol.ts          types both sides use: its calls, topics, and TerminalInfo
  handlers.ts          server: the calls and topics the socket router spreads in
  terminals.ts         server: the shells and their output
  tools.ts             server: the agent's terminal tools
  TerminalPage.tsx     what routes/t/[id].tsx renders
  TerminalRows.tsx     what the sidebar shows under a workspace
  commands.ts          its ⌘K actions
  terminals.test.ts
```

A feature is a deep module: a lot of behavior behind a small interface. Its root files are the interface, and only those are imported from outside. A feature that grows moves its private files into a subfolder, which nothing outside imports. One `index.ts` that re-exports everything is avoided, because it would mix server and browser code in one import and drag server code into the browser. Each root file is its own small entry instead.

Features call each other directly. There are no ports, slots, registries, or switches between them: with one author and only built-in code, a seam with a single implementation is only indirection.

## Server and browser code in one folder

Mixing sides in one folder is safe because the two sides are separate programs. The browser bundle and the Bun server share no runtime state and talk only over the socket, with no server functions or server rendering that run one file on both sides. The one way to go wrong is a wrong import, and that fails loudly:

- Every server file starts with `import 'server-only'`. Solid's Vite plugin fails as soon as browser code imports such a file, in dev when the page loads, and in every build. Reading `virtual:env/server` from browser code fails the same way.
- Browser-only modules, such as the socket client and the DOM helpers, start with `import 'client-only'`, which fails when the server imports them.
- A lint rule in `lint/bica.js`, run by `bun run checks`, catches what the markers would only catch when a page loads. A file that imports a Node built-in, `bun`, `ws`, Pi Durable, `pi-ai`, `pi-codemode`, `virtual:env/server`, or a server file must carry `import 'server-only'` itself. A `.tsx` file may never carry it. Type-only imports cross freely, since they vanish from the bundle.

The rule spreads the marker up the import chain, so a component can't reach server code through any number of files without lint saying so. Tests run server code under Bun, where the test preload turns both markers into empty modules.

A feature's own code shared by both sides, such as the transcript projection, is plain TypeScript with neither marker.

## Where the shared pieces go

- The protocol. Each feature's `protocol.ts` declares its own calls and topics. `src/protocol.ts` joins them, `interface Calls extends SessionCalls, TerminalCalls, … {}`, and the message types around them. A type that shows several features at once, such as a session's summary row, imports their types.
- The socket router. `src/server/socket.ts` owns connections, de-duplication, and the workspace check. It spreads each feature's handlers into one table: `const calls: Handlers = { ...sessionCalls, ...terminalCalls, … }`. `Handlers` maps every key of `Calls`, so a forgotten feature fails the type check.
- The agents. Each agent is defined in the feature it belongs to: Coding and Assistant in `agents/`, Hub in `hub/`, Night in `night-runs/`. The list of agents, and the extensions each one picks from the features, lives in `src/server/agents.ts`.
- The sidebar. `app/sidebar/` keeps the sections, filters, dragging, and indentation, and renders rows it imports by name: a workspace's sessions from `sessions/`, its terminals from `terminals/`, the hub row from `hub/`, held sessions from `night-runs/`.
- The command palette. `app/palette/` keeps searching, ranking, and keys. Each feature exports a function that returns its actions, and the palette joins them in one list.
- The settings page. `routes/settings.tsx` renders each feature's settings section by name.
- Routes. `src/routes/` keeps file routes and today's URLs. Each file reads its params and renders a feature's page.

## Sessions and the features on top

Sessions is a feature, the one most others build on: the transcript, the composer, the queue, forks, status, and archive. Agents, projects, and models sit beside it as the other base features. Hub, night runs, voice, housekeeping, and context usage build on sessions and import it, and sessions never imports them.

When sessions must tell a feature on top that something happened, such as a session archived or a worktree removed, the root file that starts the server wires it: it passes the feature's function to sessions as a plain callback. A named hook on sessions comes only when three features need the same event.

## Server-side rendering

Server-side rendering is dropped: Bica's data arrives over the socket, so the server only ever rendered an empty frame. Without it, browser code runs only in the browser, which is what makes `client-only` usable and lets the `isServer` guards go. Vite builds only the browser app, and the server runs as Bun source in dev, in `bun run start`, and in the `bica` binary. It needs Solid rc.18 or newer, and client start mode is marked experimental in the plugin's README.

## Moving there

Each step moves files as a pure rename with import fixes, in its own commit, so open worktrees can rebase across it. Splitting a file comes in a later commit.

1. Drop server-side rendering and move the design system to `ui/`. The aliases for the root folders and the `bica/server-only` lint rule are in place, and every file in `src/server` carries the marker. The move proves the aliases in Vite, `bun test`, `bun check`, and the binary.
2. Terminals, with its protocol, handlers, sidebar rows, and actions. This proves the protocol join, the spread router, and a thin route.
3. Files and Git. This proves the shape on a large UI with types both sides share.
4. Voice. This proves the direction rule, since it spans sessions on the server and the composer in the browser.
5. Models, projects, hub, night runs, context usage, and housekeeping.
6. Sessions, with what remains of `components/`, `lib/`, and `server/sessions/`, and the session page split. The sidebar and ⌘K shrink with every step before it.

The risks:

- Aliases live in three places: `imports` in `package.json` for Vite and Bun, `paths` in `tsconfig.json`, and the paths written into `vite.config.ts`. Named prefixes such as `#features/*` work everywhere, and a bare `#/` does not.
- File routes must stay in `src/routes` with their URLs.
- Branches in open worktrees that edit the socket router, the sidebar, or ⌘K conflict with every step. Land or rebase them first.
- The dev server on 3142 hosts the running sessions. Server moves are checked on a second dev server on another port.

## Explored and set aside

- A plugin system, where every feature is an extension behind slots and registries. Tried and reverted ([record](../records/extensibility.md)). A feature here is the same unit, without the contract.
- Side first, feature second: `server/<feature>`, `client/<feature>`, `shared/<feature>`. Every app compared below works this way, because separate packages or processes give them the separation for free. It spreads one feature across three trees, which is the problem this layout solves.
- A `server/` subfolder inside each feature. The same safety as the marker, but it splits a feature by layer again.
- A `.server.ts` suffix on server files, as in Remix and TanStack Start. You can see the side in the file tree and at each import, but it needs a Vite plugin of Bica's own, while the marker is Solid's built-in way.
- Separate `server.ts` and `client.ts` entry files per feature. Clear, but every component needs a re-export line, and the marker already keeps the sides apart.
- One workspace package per feature, with `exports` for each side. Node enforces the separation, but each package needs its own `package.json` and config.

## Sources

- [opencode](https://github.com/anomalyco/opencode): packages for the Solid app, core, server, and protocol. Each `protocol/src/groups/<feature>.ts` has a matching `server/src/handlers/<feature>.ts`, imported by name into one API.
- [T3 Code](https://github.com/pingdotgg/t3code): `apps/server`, `apps/web` with folders per feature, and `packages/contracts` with one schema file per feature.
- [Pi Pocket](https://github.com/TannerMidd/pi-pocket), on Pi Durable: `src/server` with a file per feature, and a separate plain JavaScript `web/` with no bundler.
- [Orca](https://github.com/stablyai/orca), [craft-agents](https://github.com/lukilabs/craft-agents-oss), [Superset](https://github.com/superset-sh/superset): Electron's `main`, `renderer`, and `shared`, with feature folders inside each.
- Matt Pocock's [codebase-design](https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design) and [setup-ts-deep-modules](https://github.com/mattpocock/skills/tree/main/skills/in-progress/setup-ts-deep-modules) skills: a module's root files are its interface, its subfolders are private, entry points instead of barrels, and one adapter means a hypothetical seam.
- [Applying deep modules to an Astro blog](https://www.jnye.co/posts/2061/deep-modules-small-codebase): one barrel `index.ts` pulled server code into client components.
- [TanStack Start import protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection): `*.server.*` files denied in the client, markers, and type-only imports allowed.
- `node_modules/@solidjs/vite-plugin/README.md`, "`server-only` and `client-only` boundary markers" and the env section.
