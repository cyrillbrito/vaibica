# Profiles

A profile says what kind of session a session is. It sets the agent's tools, its instructions, its default model and effort, whether the page shows the Git, files, and terminal panels, and whether Bica keeps the session small on its own while it sits idle.

Bica ships three, defined in code:

- Coding: every tool and the coding rules. This is the default.
- Assistant: Coding plus memory rules, kept small while idle. See [assistant-mode.md](./assistant-mode.md).
- Hub: a coordinator with its own tools and instructions, no panels, kept small while idle. See [hub.md](./hub.md).

You pick the profile in the home page's composer, next to the workspace. The context chip's menu switches an open session to another one. The tools and instructions are part of the prompt cache, so a switch rebuilds it once. Sessions from before profiles count as Coding.

There is no profile editor. A profile is a small object in `src/lib/profiles.ts`, its server half (tools, model) is in `src/server/profiles/definitions.ts`, and its instructions are the prompt sections in `src/server/profiles/instructions.ts`.
