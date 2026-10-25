# The hub

The hub is one long-lived session you talk to, often from the phone, about all your work. It knows your projects, keeps memory files on all open work, and gets work done through other sessions: it tells you where everything stands, proposes the next step, and starts, messages, and steers sessions when you say so. It does no work itself.

## Reaching it

Hub sits at the top of the sidebar and in the command palette, and the first open starts it. It needs a folder first, Hub folder in Settings → Hub, such as a `Hub` folder in your notes vault. There is one hub per Bica, outside any project.

## Its page

On top is its board: the sessions it started, and any session that asks a question or failed. What needs you comes first. Each row opens that session, and the board folds away.

Below it is the chat, with a composer and a [voice call](./voice.md) button. There are no Git, files, or terminal panels, and no model picker: Settings → Hub sets its model.

## Memory

The hub's folder holds its memory as markdown. `MEMORY.md` starts with the board, one line per open session: what it is for and whose move it is. Below it, it links one memory file per area. Live status comes from the sessions themselves, so the memory files hold only what Bica can't know.

Like an [assistant](./assistant-mode.md) session, the hub gets [housekeeping](./assistant-mode.md#housekeeping): a memory save before each compaction, and a fresh copy of `MEMORY.md` and your projects in its system prompt after it.

## What it can do

The hub runs as the Hub [agent](./agents.md), with these tools:

- `list` and the session tools ([tools.md](./tools.md#other-sessions)), across every project.
- `read` anywhere, and `write` and `edit` only inside its folder.
- `terminal_read` on any terminal, to see why a worker's tests or dev server failed without messaging the worker.
- `ask`.

It has no bash, and it reads terminals but never types into them. With a shell, a coordinator drifts into doing the work itself. A hub made before a tool was added gets it the next time its page opens.

On a [voice call](./voice.md), what the hub says after a note is spoken too, so you hear results and questions without asking.

## How it behaves

It is proactive with information, never with changes. It reads, checks, and proposes the next step with its pick, then waits for your go before it starts, messages, stops, or archives anything. It does at once what you just told it, and a worker's task asks for that: the worker reports in its reply, and writes a file, commits, or merges when you want one.

A session you drive is yours, whoever started it ([sessions.md](./sessions.md#whos-in-charge)). The hub only reports on it.

When a session finishes, the hub checks the report against what it asked for, then tells you what finished and what comes next. Worker questions come to you with its pick. Notes that arrive while it works merge into one, so ten workers finishing cost one run.

## Sources

- Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system): the lead keeps its plan in memory, gives each worker an objective, output format, and boundaries, and has workers write to files.
- Anthropic, [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): a progress file lets each fresh context find its bearings.
- Manus, [Context engineering lessons](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus): rewriting a to-do file keeps the goals in recent attention.
- Claude Code, [subagents](https://code.claude.com/docs/en/sub-agents): background results arrive as notes instead of polling.
- OpenClaw, [session tools](https://docs.openclaw.ai/session-tool): visibility scopes, and worker reports with status, result, and notes.
- Devin, [managed Devins](https://docs.devin.ai/work-with-devin/advanced-capabilities): the coordinator wakes when a child finishes or needs input.
- [agent-board](https://github.com/questpie/agent-board): "long-running agent work fails when the plan lives only in chat."
- openai/codex [#36404](https://github.com/openai/codex/issues/36404): the backend behind ChatGPT's voice gets thread tools much like the hub's, including `read_thread_terminal`.
