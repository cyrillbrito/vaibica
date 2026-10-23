# Profiles

A profile is the kind of session: it sets the agent's tools, instructions, default model and effort, which side panels the page shows, and whether Bica keeps the session small while it sits idle.

- Coding: one task in one project, with every tool. The default.
- Assistant: a session that keeps going for months, with memory in files ([assistant-mode.md](./assistant-mode.md)).
- Night: a session held for tonight, that finishes alone and writes a report ([night-runs.md](./night-runs.md)).
- Hub: the one coordinator across every project ([hub.md](./hub.md)).

You pick Assistant or Night when you start a session, and the context chip's menu can turn Assistant off. Only the hub's page makes the hub. Switching rebuilds the prompt cache once.

Each profile is one file in `src/server/profiles/`. Its instructions fill the shared prompt sections ([instructions.md](./instructions.md)).
