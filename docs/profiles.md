# Profiles

A profile says what kind of session a session is. It sets the agent's tools, its instructions, its default model and effort, whether the page shows the Git, files, and terminal panels, and whether Bica keeps the session small on its own while it sits idle.

Bica ships four, defined in code:

- Coding: one task in one project, with every tool and the coding rules. This is the default.
- Assistant: a session in one project that keeps going, such as a notes vault or a small coordinator for that project. It is Coding plus memory rules, kept small while idle, and less about code than about help. See [assistant-mode.md](./assistant-mode.md).
- Night: a session held for tonight's run. It is Coding without `ask`, at high effort or more, with rules to finish alone and end with a report. Once it ran, it turns back into Coding. See [night-runs.md](./night-runs.md).
- Hub: the one coordinator across every project, with its own tools and instructions, no panels, kept small while idle. See [hub.md](./hub.md).

A session is Coding unless you start it in assistant mode, with the Assistant toggle next to the workspace on the home page, or hold it for tonight. The context chip's menu can turn it off again. The tools and instructions are part of the prompt cache, so a switch rebuilds it once. Hub is not a choice anywhere: only the hub's own page makes the hub session, and the server refuses to make or switch any other session into one. A session with no profile counts as Coding.

There is no profile editor. A profile is a small object in `src/lib/profiles.ts`, its server half (tools, model) is in `src/server/profiles/definitions.ts`, and its instructions are the prompt sections in `src/server/profiles/instructions.ts`.
