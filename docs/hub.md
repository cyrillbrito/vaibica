# The hub

The hub is one long-lived session you talk to, often from the phone, about all your work. It knows your projects, keeps notes on every open thread, and gets work done through other sessions: it reads them, tells you where everything stands and what to do next, and starts, messages, and steers them when you say so. It does no work itself. It is the Hub [profile](./profiles.md).

## Reaching it

Hub sits at the top of the sidebar, always, and in the command palette. Both open `/hub`, and so does the app icon's Hub shortcut on the phone. The first open starts it. It needs a folder first, set under Settings → Models → Hub, such as a `Hub` folder in your notes vault. There is one hub per Bica, outside any project. A link to the hub's session, such as a notification or a "Started by" line, lands on `/hub` too.

## Its page

The hub has its own page, not the session page. On top is a board of its threads: the sessions it started, and any session that asks a question or failed, since the hub hears of those too. What needs you comes first, a question, then a failure, then a new reply, then what runs, then what sits idle. Each row shows its status and how long ago it changed, and opens that session. The board folds away, and stays folded on that device.

Below it is the chat, with a composer and a voice call button. The settings button in the top bar opens the hub's voice settings, since you talk to it by voice most, and its folder and model in Settings. There is no Git, files, or terminal panel, no model picker, since Settings sets the hub's model, and no fork, manual compaction, or profile switch: the hub is one session that keeps its own memory and compacts on its own.

The same setting picks its model. Unset, it runs Claude Sonnet 5.5 at low effort through the Anthropic provider, or the default model at low effort when Anthropic has no key. Most turns turn a rambling dictated message into a prompt, which needs a smart model more than deep reasoning, and the CLI proxy would add seconds to every reply.

## Memory

The hub's folder holds its memory as markdown. `MEMORY.md` starts with the board, one line per open thread: session id, title, project, purpose, status, and what it waits on: whose move it is, exactly what that move is, and the hub's pick. Below it, the hub links one note per area, such as `areas/bica.md`. The board holds what Bica can't know, why a session exists and what comes next. Live status comes from `list`, and what a session waits on from reading it.

Bica puts `MEMORY.md` and the list of projects with their worktrees into the hub's instructions when it starts and after each compaction, and not in between, so the prompt cache holds. Like an [assistant](./assistant-mode.md) session, it saves to its notes before Bica compacts it.

## What it can do

- `list` and the session tools, with no "leave others alone" limit. Sessions it starts are normal coding sessions on your default model, in the folder or new worktree it names.
- `read` anywhere, and `write` and `edit` only inside its folder.
- `ask`.

It has no bash. With a shell, a coordinator drifts into doing the work itself, and its context fills with output.

## How it behaves

It is proactive with information, never with changes. It reads, checks, explains, and proposes the next step with its pick, then waits for your go before anything that changes something: starting a session, sending a session new work or a decision, steering, stopping, archiving, merging, pushing, or committing. Without asking, it reads, lists, keeps its memory files, does what you just told it, and follows a standing instruction you gave earlier for the thing you named, saying it did. It answers a worker's question only when your own words already settled it, and says which words.

A session you have prompted yourself is yours, whoever started it. `session_read` and notes say so, from its prompts: a prompt with no `[Message from session …]` mark that isn't a `session_start` ticket or a note is yours. The hub only reports on such a session, and never messages it, steers it, or starts follow-ups from its results unless you ask.

Its instructions also hold the coordinator rules. Every handoff prompt stands alone like a ticket, with the goal, the boundaries, what done looks like, and the report format. Its tickets tell workers not to merge, push, or commit to main unless you asked. Workers end with a short report and put long output in files. One session per thread, reused with `session_send`. Its notes say why a session exists, but it reads the session before it says where that session stands, and after a compaction it calls `list` once to reconcile the board. Before asking you where something is, it searches its notes and the open and archived sessions, and offers its best match. Replies name at most 3 or 4 things, say for each what it waits on and whose move it is, lead with what needs you, and never spell out full paths, since you often listen by voice. Every question it asks you comes with its pick.

## Notes

The hub hears from Bica when a session it started or messaged finishes a turn, and when any session asks a question or stops with an error. Notes that arrive while it works merge into one queued note, so ten workers finishing cost one turn. Workers also report to it with `session_send`, which counts the same. When a session finishes, it checks the report against the ticket, then tells you what finished, what it checked, what the session waits on, and the next step it proposes with its pick. Worker questions come to you with its pick. After a restart or an error, it tells you which sessions stopped and where, and offers to resume them.

## Sources

- Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system): the lead keeps its plan in memory, gives each worker an objective, output format, and boundaries, has workers write to files, and scales effort to the query.
- Anthropic, [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): a progress file lets each fresh context find its bearings.
- Manus, [Context engineering lessons](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus): rewriting a to-do file keeps the goals in recent attention.
- Claude Code, [subagents](https://code.claude.com/docs/en/sub-agents): background results arrive as completion notes instead of polling.
- OpenClaw, [session tools](https://docs.openclaw.ai/session-tool): visibility scopes, and worker reports normalized to status, result, and notes.
- Devin, [managed Devins](https://docs.devin.ai/work-with-devin/advanced-capabilities): the coordinator wakes when a child finishes or needs input.
- [agent-board](https://github.com/questpie/agent-board): "long-running agent work fails when the plan lives only in chat."
