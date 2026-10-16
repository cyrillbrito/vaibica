---
name: dever
description: >
  Where processes should run on this Mac mini, and how to read Dever, the
  dashboard that keeps long-running services up. Use when starting, finding,
  or exposing a dev server or service, when asked what is running, about
  ports, Tailscale serve, Docker, or anything that must survive a Tau restart.
---

# Dever

Dever is a separate dashboard on this machine, at `~/Repos/dever`, served on `http://localhost:8080` and `https://mini.boa-carob.ts.net`. It runs under launchd, apart from Tau, so it stays up when Tau crashes and can restart Tau. Its `AGENTS.md` describes it in full.

## Where things run

Pick by what the process has to survive:

- **Bash tool**: one command that finishes, such as a build, a test, or `git status`.
- **Tau terminal**: lives as long as the work in one worktree, such as that branch's dev server or a test watcher. A Tau restart kills it, and that is fine.
- **Dever**: must outlive Tau, such as Tau itself, the main dev server of an app the user relies on, Docker, `tailscale serve`, and mise tools.

If the user wants something to keep running after the session, it belongs in Dever. Don't start or kill a Dever task without asking.

## Reading what runs

- Running Dever tasks, with their ports: `curl -sN -m 3 'http://localhost:8080/api/live?t=tasks'` (add `:<slug>` to filter by project). It is an SSE stream, so the first `data:` line is the answer.
- Projects and their commands: `sqlite3 ~/Repos/dever/data/db.sqlite 'select slug, path, commands from projects'`.
- Tailscale services: `tailscale serve status`. Dever's `services` table holds the same entries with labels.
- Anything else, like who listens on a port, is plain bash: `lsof -nP -iTCP:<port> -sTCP:LISTEN`.

## Changing things

- Starting, stopping, or restarting a Dever task needs Dever itself, because its tasks live in its process memory. Its actions are TanStack server functions with generated URLs, so there is no stable endpoint for curl yet. Ask the user to do it in the Dever UI.
- Exposing a port on the tailnet is plain bash: `tailscale serve --bg --https=<port> http://localhost:<port>`. Never use `funnel`, since that makes it public. Tell the user, so they can add it in Dever too.
- Never restart Dever or Tau's dev server on port 3142: one of them hosts this session or the user's way back in.
