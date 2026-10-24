# Terminals

Terminals are shells in a workspace, for commands and long-running processes such as dev servers. You and the agents share them. They are an [extension](./extensions.md), on by default, in `src/extensions/terminals/`.

## What you see

- A terminal belongs to a workspace ([projects.md](./projects.md)), not a session. The sidebar lists it above the workspace's sessions, and the workspace's menu has New terminal here. ⌘K finds it by name, and ⌃` opens a new one in the page's workspace.
- It is a normal login shell. It can type a first command for you, such as `bun run dev`, and anyone can Ctrl-C it and run something else. Restart opens a fresh shell and types the first command again.
- When the shell exits, the terminal keeps its output and exit code until you close it.
- It opens full size in the centre, at `/e/terminals/<id>`, with its workspace's files and changes in the right panel. On a phone, a key bar adds Esc, Tab, Ctrl-C, and arrows.
- Any number of tabs can show the same terminal and join late. They draw it with [ghostty-web](https://github.com/coder/ghostty-web), Ghostty compiled to WebAssembly.
- Restarting Bica ends every shell.
- A new worktree runs its setup in a terminal called Setup, which closes itself when the setup succeeds ([projects.md](./projects.md)).

In zsh, Bica knows when each command starts and ends and its exit code, without touching your zsh config.

## Agents

Agents get four tools, shaped after Codex's and Claude Code's background shells:

- `terminal_start` opens a shell, maybe with a first command. Starting the same name again restarts it in place, so a restarted dev server leaves no dead terminal behind.
- `terminal_read` returns the latest output and whether a command is running.
- `terminal_send` types into it, optionally pressing Ctrl-C first.
- `terminal_stop` closes it.

With `notify`, the agent gets a note when the command finishes, even if it is idle by then. A dev server rarely finishes, so its note usually means it crashed. Agents are told to use terminals instead of `&`, to check for a running one first, and to stop what they started. Archiving a session closes the terminals it started, and cleaning up a worktree closes its terminals.

The [hub](./hub.md) gets only `terminal_read`, to read any terminal without typing into it. Its description tells the hub to read a worker's failed build there instead of messaging the worker. `list` shows each workspace's terminals to every agent.

## Switched off

Settings → Extensions turns terminals off. Then the sidebar rows, the page, the ⌘K entries, and the agents' terminal tools are gone, and a new worktree runs no setup. Shells already open keep running, unseen, until Bica restarts.

## Sources

- Zed's [tasks](https://zed.dev/docs/tasks): rerunning a task reuses its terminal, and `hide: on_success` closes it when it succeeds.
- Conductor's [run script](https://docs.conductor.build/core/scripts) kills the old run before starting the new one.
