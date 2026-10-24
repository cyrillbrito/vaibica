# Architecture

Bica is a Bun server on the dev machine and a web app that talks to it over one WebSocket. The server owns the agent, the data, the disk, and git. The browser only shows what the server sends.

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

## Concepts

- A project is a folder on the dev machine, usually a git repo. A workspace is the exact folder work happens in: the project folder or one of its worktrees. See [projects.md](./projects.md).
- A session is one agent conversation in one workspace. See [sessions.md](./sessions.md).
- A run is the agent working on a prompt until it answers.
- A terminal is a shell in a workspace, shared by you and the agents. See [terminals.md](./terminals.md).
- The harness is Pi Durable's engine inside the server. It runs every session and saves each step before anyone sees it.

## Server modules

`src/server` is grouped into modules. Each module is a folder with one `index.ts`, and code outside the folder imports only that file, through the `#server/...` and `#lib/...` aliases.

- `agent/`: the harness and the agent's own tools ([tools.md](./tools.md)).
- `providers/`: models, keys, sign-ins, and plan accounts ([models.md](./models.md)).
- `sessions/`: what Bica adds to a conversation: titles, prompts and the queue, voice turns, and the session tools ([sessions.md](./sessions.md)).
- `profiles/`: each kind of session's tools, model, and instructions ([profiles.md](./profiles.md), [instructions.md](./instructions.md)).
- `git/`: status, diffs, staging, and commits ([git.md](./git.md)).
- `terminals/`: shells and the agent's terminal tools ([terminals.md](./terminals.md)).

The flat files next to them each do one job. `socket.ts` is the one table of calls and topics. `extensions.ts` installs the built-in extensions that are on.

`src/extensions` holds the features that can be switched off, through the `#extensions/...` alias, each with a server half and a browser half. Core never imports one directly. See [extensions.md](./extensions.md).

Server code doesn't hot-reload in development: it runs as it started until Bica restarts. Page edits still reload.

## How a prompt travels

1. You send from the composer, and the browser sends a request with a fresh id.
2. The server hands the prompt to the session, which queues it if a run is going.
3. The harness runs the agent in the workspace folder and saves every step to SQLite.
4. Each save produces a small list of changes, which the server forwards to every tab watching that session.

A restart resumes unfinished runs, and a dropped phone reconnects to fresh data. See [realtime-communication.md](./realtime-communication.md).

## Where data lives

Bica's data sits in `.data/`, relative to where the server starts. The browser keeps small preferences per device, such as the theme, and a cache of what it last showed.

| What | Where |
| --- | --- |
| Sessions, transcripts, queues | `harness.sqlite` |
| Projects | `projects.json` |
| Settings | `settings.json` |
| Keys and sign-ins | `auth.json` |
| Worktrees, branches, files | git and the disk |

Your own files for Bica live in `~/.bica/`: an `AGENTS.md` and skills for every session ([instructions.md](./instructions.md)), and the chat folders ([projects.md](./projects.md#chats)).

## Safety

There is no login. Bica is reached on localhost or over Tailscale, and that network is the security boundary. The socket refuses other websites, and every file or git request must stay inside its workspace. See [deploy.md](./deploy.md).
