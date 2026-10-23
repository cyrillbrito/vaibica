# The hub

The hub is one long-lived session you talk to, often from the phone, about all your work. It knows your projects, keeps notes on every open thread, and gets work done through other sessions: it tells you where everything stands, proposes the next step, and starts, messages, and steers sessions when you say so. It does no work itself.

## Reaching it

Hub sits at the top of the sidebar and in the command palette, and the first open starts it. It needs a folder first, set in Settings → Hub, such as a `Hub` folder in your notes vault. There is one hub per Bica, outside any project.

## Its page

On top is a board of its threads: the sessions it started, and any session that asks a question or failed. What needs you comes first. Each row opens that session, and the board folds away.

Below it is the chat, with a composer and a [voice call](./voice.md) button. There are no Git, files, or terminal panels, and no model picker: Settings → Hub sets its model.

## Memory

The hub's folder holds its memory as markdown. `MEMORY.md` starts with the board, one line per open thread: what the session is for and whose move it is. Below it, it links one note per area. Live status comes from the sessions themselves, so the notes hold only what Bica can't know.

Like an [assistant](./assistant-mode.md) session, the hub saves to its notes before it is compacted, and gets `MEMORY.md` and your projects in its instructions after each compaction.

## What it can do

- `list` and the session tools ([tools.md](./tools.md#other-sessions)), across every project.
- `read` anywhere, and `write` and `edit` only inside its folder.
- `ask`.

It has no bash. With a shell, a coordinator drifts into doing the work itself.

## How it behaves

It is proactive with information, never with changes. It reads, checks, and proposes the next step with its pick, then waits for your go before it starts, messages, stops, or archives anything. It does at once what you just told it.

A session you drive is yours, whoever started it ([sessions.md](./sessions.md#who-drives-a-session)). The hub only reports on it.

When a session finishes, the hub checks the report against what it asked for, then tells you what finished and what comes next. Worker questions come to you with its pick. Notes that arrive while it works merge into one, so ten workers finishing cost one turn.

## Sources

- Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system): the lead keeps its plan in memory, gives each worker an objective, output format, and boundaries, and has workers write to files.
- Anthropic, [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): a progress file lets each fresh context find its bearings.
- Manus, [Context engineering lessons](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus): rewriting a to-do file keeps the goals in recent attention.
- Claude Code, [subagents](https://code.claude.com/docs/en/sub-agents): background results arrive as notes instead of polling.
- OpenClaw, [session tools](https://docs.openclaw.ai/session-tool): visibility scopes, and worker reports with status, result, and notes.
- Devin, [managed Devins](https://docs.devin.ai/work-with-devin/advanced-capabilities): the coordinator wakes when a child finishes or needs input.
- [agent-board](https://github.com/questpie/agent-board): "long-running agent work fails when the plan lives only in chat."
