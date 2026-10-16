# Terminals

Terminals are shells in a workspace, for commands and long-running processes such as dev servers. You and the agents share them.

## What you see

- A terminal belongs to a workspace ([projects.md](./projects.md)), not a session. The sidebar lists them above the workspace's sessions, and the workspace's terminal button opens a new one.
- A terminal is always an interactive login shell. It can type a first command for you, such as `bun run dev`, and anyone can Ctrl-C it and run something else. Restart opens a fresh shell and types the first command again.
- When the shell exits, the terminal stays with its output and exit code until you close it. Terminals an agent closes, and a worktree's Setup terminal once it succeeds, leave on their own.
- Archiving a session closes the terminals it started.
- It opens full size in the centre, with the workspace's Files and Git on the right. On a phone, a key bar adds Esc, Tab, Ctrl-C, and arrows.

## How it works

The server owns the shells, each in its own PTY, and streams their output over the WebSocket like everything else. The browser draws them with [ghostty-web](https://github.com/coder/ghostty-web), Ghostty's terminal compiled to WebAssembly. Any tab can join late and gets the kept output. Several tabs can show one terminal, and the last one to resize sets its size.

In zsh, Bica knows when each command starts and ends, and its exit code, no matter who typed it. It uses the same invisible shell marks as VS Code and Ghostty, added without touching your own zsh config. Other shells work without them.

Shells live in the server process, so restarting Bica ends them.

## Agents

Agents get four tools, shaped after Codex's and Claude Code's background shells, and mirroring the session tools in [tools.md](./tools.md):

- `terminal_start` opens a shell in the session's folder, maybe with a first command, and returns once output settles. Starting the same name again reuses that terminal: what runs there stops and the new command starts in its place, so restarting a dev server leaves no dead terminal behind. A running terminal of yours or another session's is never taken over.
- `terminal_read` returns the latest output and whether it is running a command, at the prompt, or exited.
- `terminal_send` types into it: a command or input for a REPL. With `interrupt`, it presses Ctrl-C first and waits for the prompt.
- `terminal_stop` closes the terminal and returns its last lines.

With `notify`, the agent gets a note when the command finishes, with its exit code and last lines, even if it is idle by then. It is on by default for a first command. A dev server rarely finishes, so its note usually means it crashed. What the agent stops itself (stop, interrupt, restart) sends no note. Notes live in memory, so a server restart drops them.

Agents see plain text, the tail only, with runs of blank lines counted as one. Their instructions say to use terminals instead of `&` or nohup, to check for a running one first, and to stop what they started. A terminal an agent started links back to its session.

## Sources

- Zed's tasks: rerunning a task reuses its terminal (`use_new_terminal: false`), and `hide: on_success` closes it when it succeeds. https://zed.dev/docs/tasks
- Conductor's run script in `nonconcurrent` mode kills the old run before starting the new one, and archiving a workspace removes it. https://docs.conductor.build/core/scripts
