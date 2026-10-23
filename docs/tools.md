# Agent tools

The agent works through tools. Every call carries a short summary of what it is for, so the transcript reads as a list of intentions. The exception is `codemode` on models that write its script as raw text, such as GPT-5, which take no other field. What the agent is told about using them is in [instructions.md](./instructions.md).

- Read, write, edit, and bash work in the session's folder. Read also shows images to the model, shrunk when they are too big.
- Web search and fetch go through Exa, once its key is set ([models.md](./models.md#providers)).
- Terminal tools share the workspace's terminals with you ([terminals.md](./terminals.md)).

## Codemode

Codemode lets the model write a short JavaScript script that calls the other tools, so it can run them in parallel, chain them, and filter big output. Only what the script prints reaches the model. It is Pi Durable's codemode: each call in a script is a tool call of its own, and a script survives a restart. Scripts can't call the tools that need the model itself, such as `ask` and the session tools.

Scripts can also call classifier models, which answer typed yes/no, choice, or score questions in well under a second for a fraction of a cent. That makes it cheap to label many items and read only the flagged ones.

## Asking you

`ask` puts one to four multiple-choice questions to you and ends the run. Nothing waits, so a question can be answered hours later from another device. Typing in the composer answers too, and number keys pick options. Once answered, the card folds into one row.

## Other sessions

Agents can work with other sessions the way they work with terminals: start, read, send, and stop. Bica has no hidden subagents: every helper is a normal session you can open and steer.

- `list` shows every project, workspace, session, and terminal. Agents are told to leave the rest alone unless you name it.
- `session_start` starts a session with a prompt that stands on its own, in any workspace or a new worktree, optionally in [assistant mode](./assistant-mode.md) or held for the [night run](./night-runs.md).
- `session_read` returns a session's status, the questions it waits on, and its last reply.
- `session_send` sends a signed message, so the receiver can answer.
- `session_stop` stops a session's turn.
- `session_archive` archives a finished session, and can remove its worktree when nothing would be lost.

The starter gets a note whenever a session it started finishes a turn, with its last reply, until you take that session over ([sessions.md](./sessions.md#who-drives-a-session)). Notes arrive as queued prompts, and ones that pile up merge into one.

## Sources

- Claude Code's `SendMessage` with `notify_when_idle`, and Codex's `send_input` and `wait_agent`, which the session tools follow.
- Taking over a session: Zendesk and Intercom stop their bot once a human takes a conversation, and [`pi-cmux-orchestrator`](https://www.npmjs.com/package/@mporenta/pi-cmux-orchestrator) holds back the orchestrator once you type in a worker.
- Pi Durable's [`codemode`](https://github.com/earendil-works/pi/tree/main/packages/durable).
- The [web search benchmark for coding agents](https://github.com/openbenchmarks-labs/web-search-for-coding-agents), where Exa leads search and fetch.
