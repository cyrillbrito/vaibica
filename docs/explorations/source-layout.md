# Source layout

The layout Bica's source should have: three packages, one per side, and inside each the same feature folders, so a feature is easy to find on both sides. The packages are built ([architecture.md](../architecture.md#packages), [record](../records/packages-per-side.md)). The feature folders inside them are not.

## The tree

```
client/src/
  App.tsx  Document.tsx  router.ts   the app's root; start mode looks for them here
  routes/                            one thin file per URL, rendering a feature's page
  app/                               the frame around pages: sidebar, ⌘K, top bar, layout, settings page, test data
  socket/                            the browser end of the socket and the topic cache
  ui/                                the design system and DOM helpers
  sessions/  agents/  projects/  models/  files/  git/  terminals/
  voice/  hub/  night-runs/  context-usage/  housekeeping/
server/src/
  socket.ts  agents.ts  paths.ts     the server's root: socket router, the list of agents, data paths
  testing/
  sessions/  agents/  projects/  models/  files/  git/  terminals/  ...   the same names
shared/src/
  protocol.ts                        every call and topic, joined from each feature's slice
  sessions.ts  terminals.ts  ...     one slice per feature: its calls, topics, and types
```

A feature has the same name on every side. Terminals is `client/src/terminals`, `server/src/terminals`, and `shared/src/terminals.ts`.

The layers import downward only. `ui/` and `socket/` know no features. Features import `ui/`, `socket/`, and the features they build on. The root files and folders (`routes/`, `app/`, `App.tsx`, the server's `socket.ts` and `agents.ts`) import features by name and join them, and no feature imports them.

## A feature

A feature owns one capability on its side: its pages and rows, or its handlers and agent tools. Terminals, for example:

```
server/src/terminals/
  handlers.ts          the calls and topics the socket router spreads in
  terminals.ts         the shells and their output
  tools.ts             the agent's terminal tools
  terminals.test.ts
client/src/terminals/
  TerminalPage.tsx     what routes/t/[id].tsx renders
  TerminalRows.tsx     what the sidebar shows under a workspace
  commands.ts          its ⌘K actions
shared/src/terminals.ts  its calls, topics, and TerminalInfo
```

A feature is a deep module: its root files are the interface, and a feature that grows moves its private files into a subfolder that nothing outside imports.

Features call each other directly. There are no ports, slots, registries, or switches between them ([record](../records/extensibility.md)): with one author and only built-in code, a seam with a single implementation is only indirection.

## Where the joined pieces go

- The protocol. Each feature's slice in `shared/src` declares its calls and topics. `protocol.ts` joins them, `interface Calls extends SessionCalls, TerminalCalls, … {}`, and the message types around them.
- The socket router. `server/src/socket.ts` owns connections, de-duplication, and the workspace check. It spreads each feature's handlers into one table: `const calls: Handlers = { ...sessionCalls, ...terminalCalls, … }`. `Handlers` maps every key of `Calls`, so a forgotten feature fails the type check.
- The agents. Each agent is defined in the feature it belongs to: Coding and Assistant in `agents/`, Hub in `hub/`, Night in `night-runs/`. `server/src/agents.ts` lists them and the extensions each one picks.
- The sidebar. `app/sidebar/` keeps the sections, filters, dragging, and indentation, and renders rows it imports by name: a workspace's sessions from `sessions/`, its terminals from `terminals/`, the hub row from `hub/`.
- The command palette. `app/palette/` keeps searching, ranking, and keys. Each feature exports a function that returns its actions, and the palette joins them in one list.
- The settings page. `routes/settings.tsx` renders each feature's settings section by name.

## Sessions and the features on top

Sessions is the feature most others build on: the transcript, the composer, the queue, forks, status, and archive. Agents, projects, and models sit beside it. Hub, night runs, voice, housekeeping, and context usage build on sessions and import it, and sessions never imports them.

When sessions must tell a feature on top that something happened, such as a session archived, the root file that starts the server passes the feature's function to sessions as a plain callback. A named hook comes only when three features need the same event.

## Moving there

Each step moves files as a pure rename with import fixes, in its own commit, so open worktrees can rebase across it.

1. The design system to `client/src/ui/`.
2. Terminals on all three sides, with its protocol slice, handlers, sidebar rows, and actions. This proves the protocol join, the spread router, and a thin route.
3. Files and Git.
4. Voice, which spans sessions on the server and the composer in the browser.
5. Models, projects, hub, night runs, context usage, and housekeeping.
6. Sessions, with what remains of `components/`, `lib/`, and `server/src/sessions/`. The sidebar and ⌘K shrink with every step before it.

The risks:

- File routes must stay in `client/src/routes` with their URLs.
- Branches in open worktrees that edit the socket router, the sidebar, or ⌘K conflict with every step. Land or rebase them first.
- The dev server on 3142 hosts the running sessions. Server moves are checked on a second dev server on another port.

## Sources

- [opencode](https://github.com/anomalyco/opencode): packages for the Solid app, core, server, and protocol. Each `protocol/src/groups/<feature>.ts` has a matching `server/src/handlers/<feature>.ts`, imported by name into one API.
- [T3 Code](https://github.com/pingdotgg/t3code): `apps/server`, `apps/web` with folders per feature, and `packages/contracts` with one schema file per feature.
- [Orca](https://github.com/stablyai/orca), [craft-agents](https://github.com/lukilabs/craft-agents-oss), [Superset](https://github.com/superset-sh/superset): Electron's `main`, `renderer`, and `shared`, with feature folders inside each.
- Matt Pocock's [codebase-design](https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design) skill: a module's root files are its interface, and its subfolders are private.
