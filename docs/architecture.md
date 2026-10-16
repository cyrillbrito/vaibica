# Architecture

Bica is a Bun server on the dev machine and a web app that talks to it over one WebSocket. The server owns the agent, the data, the disk, and git. The browser is a view that keeps a live copy of what it shows and nothing else.

```
 Browser (laptop, phone)                     Server (dev machine, one process)
┌───────────────────────────┐              ┌──────────────────────────────────────┐
│ Solid app                 │              │ Pi Durable harness                   │
│  sessions · transcript    │   one        │  conversations, runs, tools, queue   │
│  project page · git       │◀─WebSocket──▶│  → .data/harness.sqlite              │
│  terminals · settings     │   per tab    │ Projects, settings, keys, usage      │
│                           │              │  → small JSON files in .data/        │
│ no disk access            │              │ Git, files, and terminal shells      │
└───────────────────────────┘              └──────────────────────────────────────┘
```

The server runs on Bun, which gives terminals a native PTY with no addon, loads TypeScript as is, and runs Pi Durable and codemode. Pi Durable keeps its own SQLite storage, through Bun's `node:sqlite`.

## Concepts

- A project is a folder on the dev machine, usually a git repo, added by hand.
- A workspace is the exact folder work happens in: the project folder or one of its worktrees.
- A session is one agent conversation in one workspace, with its own model, transcript, queue, and status.
- A run is the agent working on a prompt, through model calls and tool calls, until it answers.
- A terminal is a shell in a workspace, shared by you and the agents.
- The harness is Pi Durable's engine inside the server. It runs every session and saves each step before anyone sees it.
- The fast model is an optional small model for side jobs such as titles and commit messages. Without it, those fall back to simple defaults.

## Server modules

`src/server` is grouped into modules. Each module is a folder with one `index.ts`, and code outside the folder imports only that file. Cross-module imports use the `#server/...` and `#lib/...` aliases from `package.json`, and files inside a module import each other with relative paths.

- `agent/`: the Pi Durable harness and the agent's own tools (files, bash, web, codemode, `ask`).
- `providers/`: models, keys, sign-ins, the CLI proxy, and the fast model.
- `sessions/`: everything Bica adds to a conversation: titles, projects, notes between sessions, prompts and the queue, voice turns, and the session tools.
- `profiles/`: what a coding, assistant, or hub session runs with: tools, model, instructions, skills, and the upkeep of long-lived sessions.
- `git/`: status, diffs, staging, commits, and commit messages.
- `terminals/`: shells and the agent's terminal tools.

`socket.ts`, `live.ts`, `projects.ts`, `github.ts`, `voice.ts`, `paths.ts`, and `ws-log.ts` stay flat files: each is one job with a small surface. `socket.ts` is the one table of calls and topics, and it starts the upkeep loop when the first socket connects.

In development the server code doesn't hot-reload. `vite.config.ts` loads `socket.ts` once, through a module runner of its own with HMR off, so the server keeps running the code it started with until Bica restarts. Page edits still hot-reload. Editing `vite.config.ts` restarts Vite in the same process and runs the server code again, which is why the open harness alone lives on `globalThis`: one process owns its storage.

## How a prompt travels

1. You send from the composer, and the browser sends a request with a fresh id.
2. The server hands the prompt to the session, which queues it if a run is going.
3. The harness runs the agent in the workspace folder and saves every step to SQLite as it happens.
4. Each save produces a small list of changes, which the server forwards to every tab watching that session.
5. Each tab applies them to its copy and re-renders.

A server restart resumes unfinished runs, and a dropped phone reconnects to fresh snapshots. Nothing is replayed and nothing is lost. See [realtime-communication.md](./realtime-communication.md).

## Where data lives

Bica's own data sits in `.data/`, relative to where the server starts. The browser keeps small preferences per device, such as the theme, and a cache of what it last showed, so pages open at once (see [realtime-communication.md](./realtime-communication.md)).

| What | Where |
| --- | --- |
| Sessions, transcripts, queues | `harness.sqlite` |
| Projects | `projects.json` |
| Defaults and git habits | `settings.json` |
| Keys and sign-ins from Settings | `auth.json` |
| Worktrees, branches, file contents | git and the disk, read when asked |

Your own files for Bica live in `~/.bica/`: an `AGENTS.md` and skills for every session ([instructions.md](./instructions.md)), the chat folders ([projects.md](./projects.md)), and the socket log ([realtime-communication.md](./realtime-communication.md)).

## Pages

- Home starts a session in a chosen workspace.
- A session shows the transcript and composer in the centre, the session list on the left, and its workspace's Files and Git on the right.
- A terminal, or a workspace's project page with a file or diff, takes the centre the same way, with the same side panels.
- Settings holds appearance, providers, the CLI proxy, models, the prompt cache, and git habits.

On a phone, the side columns become drawers and sheets. See [UI.md](./UI.md).

## Safety

There is no login. The server is reached on localhost or over Tailscale, and that network is the security boundary. The socket refuses other websites, and every file or git request is checked to stay inside its workspace. See [deploy.md](./deploy.md) and [files.md](./files.md).
