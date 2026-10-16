# Tau!

Tau is a fast web UI for Pi agents, built on Pi Durable. It runs on the dev machine and works from any browser, on desktop or phone.

## Mindset

Tau is a complete development tool for one person, the author. It is not a product for others. It should cover everything needed to build features with agents, from start to finish:

- Agent sessions are the core, but not the whole tool.
- Each feature gets its own worktree, so parallel agents never collide.
- Review happens in full-screen diffs, not a cramped side panel, and review comments go back to the agent.
- Git covers commit, push, pull requests, and cleaning up merged worktrees.
- Files can be opened, searched, and quickly edited.

If a daily dev task forces a switch to another app, that is a gap worth closing. Heavy editing in VS Code is the one accepted exception.

There is no time to prove every idea here, so borrow from people who already built or measured it: other apps, Pi packages, studies, and posts. Look at several sources, take the part that gives the most benefit for the least complexity, and leave the rest. Treat their numbers with care, since anyone can find a benchmark that flatters their tool, but still link them: they show the direction is sound and where the idea came from. A doc for a feature built this way ends with its sources.

## Goals

- Remote first. The server runs on the dev machine, and the UI works in any browser and installs as an app on the phone.
- Fast and polished. Interactions feel instant, output streams, and nothing jumps. Design quality counts as a feature.
- Many sessions at once. You can watch them stream, steer or queue messages while the agent works, and reconnect or join late without losing anything.
- Reviewing the agent's work in full-size files and diffs, with comments that go back to the agent.

## Out of scope

- The Pi coding agent itself. Tau runs its own agent on Pi Durable. The coding agent's code and extensions are a good source of ideas, since the APIs are close, but Tau never runs them.
- A full IDE. Heavy editing opens your editor.
- Native mobile or desktop apps. The web app is the app.

## Stack

- Bun runs the server, installs packages, and runs Vite in development.
- Solid 2 (release candidate) through `@solidjs/vite-plugin` in start mode. This is not SolidStart.
- Pi Durable, with `pi-ai` for models, runs the agent and stores it in SQLite.
- Tailwind v4 with no component library, see [docs/UI.md](docs/UI.md).
- Pierre for diffs, file views, and the file tree, through their plain JavaScript entries, not the React ones.
- Oxlint and Oxfmt for linting and formatting.

[docs/architecture.md](docs/architecture.md) explains how the parts fit together.

## Commands

- `bun run check` type-checks, `bun run lint` lints, and `bun run fmt` formats.
- `bun run test:bun` runs the Bun checks for Pi Durable, restart recovery, and images. There is no Vitest suite.
- `bun run dev` is the dev server on port 3142. It usually runs already, see Verifying UI below.
- `bun run build` and `bun run start` run a built copy, see [docs/deploy.md](docs/deploy.md).
- `bun run build:tau` compiles the `tau` binary into `dist/tau/tau`, and the `release` workflow publishes it as a draft GitHub release, see the same doc.

## Next

- Line comments sent to the agent, and quick edits in Pierre's edit mode.
- Opening pull requests, and comparing a worktree against its branch base.
- Installing as an app on the phone.
- A file watcher instead of polling.
- A file mode in the command palette: `/` searches the workspace's files, and ⌘P opens straight into it.

## Library docs

Pi Durable, Solid 2, and Pierre are new and change often, and the web may describe a newer version than the one installed. Read the installed copy first.

- Pi Durable: `node_modules/@earendil-works/pi-durable/README.md` and `CHANGELOG.md`, plus the READMEs of `pi-ai` and `chord` next to it. Examples: https://github.com/earendil-works/pi/tree/main/packages/durable, and a small coding agent on it: https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/experimental/durable
- Solid 2: `node_modules/solid-js/CHEATSHEET.md` and the skills under SolidJS 2 below. Full docs for agents: https://v2.solidjs.com/llms.txt
- Markdown: the skills in `node_modules/@tanstack/markdown/skills/` (the React ones don't apply).
- Pierre: https://diffs.com/llms.txt and https://trees.software/llms.txt.
- Vite: https://vite.dev/guide/ and `node_modules/@solidjs/vite-plugin/README.md` for start mode.

## Docs

`docs/` is a short user manual of what exists, one doc per feature, written as [docs/writing.md](docs/writing.md) describes. This list is the index: add new docs here.

- [architecture.md](docs/architecture.md): concepts, how a prompt travels, where data lives.
- [sessions.md](docs/sessions.md): sessions on Pi Durable, the transcript, queue, forks, status, archive.
- [tools.md](docs/tools.md): the agent's tools, codemode, `ask`, and working with other sessions.
- [instructions.md](docs/instructions.md): the agent's instructions and skills.
- [context-usage.md](docs/context-usage.md): context window, prompt cache, spend, compaction, clean up.
- [profiles.md](docs/profiles.md): coding, assistant, and hub sessions: their tools, instructions, and panels.
- [assistant-mode.md](docs/assistant-mode.md): sessions that run for months, with memory in files.
- [hub.md](docs/hub.md): the one session that coordinates the others.
- [voice.md](docs/voice.md): voice calls with a session, and how they sound.
- [projects.md](docs/projects.md): projects, worktrees, chats, pull requests, the sidebar.
- [files.md](docs/files.md): the project page, file and diff views, file lists.
- [command-palette.md](docs/command-palette.md): ⌘K search and actions, and the keyboard shortcuts.
- [git.md](docs/git.md): the Git tab, commit messages, and `git init` for new folders.
- [terminals.md](docs/terminals.md): shared shells for you and the agents.
- [providers.md](docs/providers.md): keys, sign-ins, models, plan usage.
- [proxy.md](docs/proxy.md): the CLIProxyAPI provider.
- [realtime-communication.md](docs/realtime-communication.md): the WebSocket protocol.
- [deploy.md](docs/deploy.md): running Tau, reaching it over Tailscale, the `tau` binary, and releases.
- [UI.md](docs/UI.md): design rules and tokens. Read before UI work.
- [writing.md](docs/writing.md): how to write docs, comments, and commit messages.

`docs/explorations/` holds research and ideas for what isn't built, and has no index. Write one only when the user asks for it. `docs/inspiration/` holds screenshots of other agent UIs, as ideas, not specs.

## Rules

- Write docs, comments, and commit messages as [docs/writing.md](docs/writing.md) describes. Comments are rare and say why, never what.
- Read [docs/UI.md](docs/UI.md) before any UI work.
- Keep this file and `docs/` up to date with every change. Add a doc when a new area appears.
- Simplicity first. If a change adds complexity, look for a smaller one.
- Answer questions in the reply. Don't write a plan or an exploration doc unless the user asks for one.

## Verifying UI

After UI changes, check them in a real browser with `agent-browser`, a global CLI configured in `~/.agent-browser/config.json`. Its skill explains how to use it. These are the facts for this repo:

- The dev server (`bun run dev`, port 3142) usually hosts the Tau session you are running in. Don't restart or stop it. Vite picks up page edits on its own, but server code (`src/server`) runs as it started until Tau restarts: test server changes on your own dev server on another port. Another dev server may run on a different port; inspect running terminals before starting one.
- Open `http://localhost:3142`, then check `errors` and `console` for Solid warnings and socket errors.
- For the phone layout, run `set viewport 390 844` and check again.
- For worst-case data, open the page with `?data=worst`. See Test data in `docs/UI.md`.
- The data is real. Don't create, send to, or delete sessions, and don't commit, unless that is what you are testing.

## SolidJS 2

This project uses SolidJS 2. Solid is not React. Components run once and never re-render. Updates flow through signals to exactly the parts that read them, and effects and memos follow Solid's own rules. Don't bring React patterns over.

Read `node_modules/solid-js/CHEATSHEET.md` before writing Solid code. It matches the installed version, and it ends with the corrections for habits from Solid 1 and React.

### Skills that ship with the installed packages

Read these when you need them. They match the installed versions.

- `node_modules/solid-js/skills/reactivity-diagnostics/SKILL.md` maps every dev-mode warning code, such as `REACTIVE_WRITE_IN_OWNED_SCOPE` or `STRICT_READ_UNTRACKED`, to its fix. Read it whenever one of those codes shows up in test output or the browser console.
- `node_modules/@solidjs/diagnostics/skills/agent-loops/SKILL.md` explains how to record which parts re-ran and why, find wasted work, and set limits on it, in tests and on live pages.

### Debugging updates

When something doesn't update, updates too often, or is slow, record what happened instead of guessing, as Debugging Solid updates in [docs/UI.md](docs/UI.md) describes. Give signals, memos, and effects a name with the `{ name: "..." }` option, because the reports identify them by name.
