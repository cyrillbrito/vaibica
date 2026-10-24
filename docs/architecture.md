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

[GLOSSARY.md](./GLOSSARY.md) names every concept. These are the ones the rest builds on.

- A project is a folder on the dev machine, usually a git repo. A workspace is the exact folder work happens in: the project's main folder or one of its worktrees. See [projects.md](./projects.md).
- A session is one agent conversation in one workspace. See [sessions.md](./sessions.md).
- An agent is what a session runs as: its system prompt, model, extensions, and skills. See [agents.md](./agents.md).
- A run is the agent working on a prompt until it replies, made of turns: one model response and its tool calls each.
- A terminal is a shell in a workspace, shared by you and the agents. See [terminals.md](./terminals.md).
- The harness is Pi Durable's engine inside the server. It runs every session and saves each turn before anyone sees it.

## Server modules

`src/server` is grouped into modules. Each module is a folder with one `index.ts`, and code outside the folder imports only that file, through the `#server/...` and `#lib/...` aliases. Every server file starts with `import 'server-only'`: Solid's Vite plugin fails when browser code imports one, and the `bica/server-only` lint rule makes any file that imports server code carry the marker too, so a component can't reach it through other files.

- `agent/`: the harness and the agent's own tools ([tools.md](./tools.md)).
- `providers/`: models, keys, sign-ins, and plan accounts ([models.md](./models.md)).
- `sessions/`: what Bica adds to a conversation: titles, prompts and the queue, notes, voice handoffs, the session tools, and what runs around them, such as night runs, housekeeping, and the hub ([sessions.md](./sessions.md)).
- `agents/`: one file per agent, with its extensions, model, and system prompt ([agents.md](./agents.md), [system-prompt.md](./system-prompt.md)).
- `git/`: status, diffs, staging, and commits ([git.md](./git.md)).
- `terminals/`: shells and the agent's terminal tools ([terminals.md](./terminals.md)).

The flat files next to them each do one job. `socket.ts` is the one table of calls and topics.

Server code doesn't hot-reload in development: it runs as it started until Bica restarts. Page edits still reload.

## How a prompt travels

1. You send from the composer, and the browser sends a request with a fresh id.
2. The server hands the prompt to the session, which queues it if a run is going.
3. The harness runs the agent in the workspace and saves every turn and tool call to SQLite.
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

Your own files for Bica live in `~/.bica/`: an `AGENTS.md` and skills for every session ([system-prompt.md](./system-prompt.md)), and the chat folders ([projects.md](./projects.md#chats)).

## Safety

There is no login. Bica is reached on localhost or over Tailscale, and that network is the security boundary. The socket refuses other websites, and every file or git request must stay inside its workspace. See [deploy.md](./deploy.md).
