# Agents

An agent is what goes into a session: its instructions, its model and effort, its tools, and its skills. Every session runs as one agent. Pi Durable uses the same word for the bundle a conversation runs with, and so do Claude Code, opencode, and eve.

- Coding: one task in one project, with every tool. The default.
- Assistant: a helper for one project that keeps going for months, with memory in files ([assistant-mode.md](./assistant-mode.md)).
- Night: finishes alone, at high effort or more, and ends with a report ([night-runs.md](./night-runs.md)). It has no `ask`, since nobody can answer.
- Hub: coordinates other sessions with the session tools and no shell, on its own model ([hub.md](./hub.md)).

An agent holds nothing else. What Bica does around a session is a feature of its own that looks at which agent the session runs as:

- The night runs feature holds a session for tonight as Night, and switches it to Coding once it ran.
- Idle upkeep cleans up and compacts Assistant and Hub sessions while they sit idle.
- The hub's page has no side panels, Settings → Hub picks its folder and model, and the hub hears when any session asks or fails. Sessions it starts get the default model, not its own.
- The Assistant toggle on the home composer starts a session as Assistant, and the context chip's menu switches it back to Coding. Switching rebuilds the prompt cache once.

Each agent is one file in `src/server/agents/`, a plain object that names its tool packs. Its instructions fill the shared prompt sections ([instructions.md](./instructions.md)). The browser's half, each agent's label and description, is `src/lib/agents.ts`.

## Sources

- Pi Durable's per-conversation agent, which `configure()` changes in one commit.
- Agents as data in [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) and [opencode agents](https://opencode.ai/docs/agents/).
