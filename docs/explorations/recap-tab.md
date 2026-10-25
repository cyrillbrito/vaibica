# Plans and the Recap tab

Research on agent to-do lists, and on a Recap tab in the side panel that shows what one session has done, is doing, and has left. A prototype of option B is built; the rest isn't.

The question behind it: a to-do list shows where the agent is going, which is nice to watch, but a list written up front can lock the agent into steps it should drop once it learns more.

## What the research says

- The big harnesses are taking their to-do tools away from frontier models. Amp removed its to-dos in January 2026: with Opus 4.5 the agent tracked its own work, and writing the list cost time, tokens, and screen space. Claude Code v2.1.233 (August 2026) turned TodoWrite and the Task tools off for Opus 4.8, Sonnet 5, and newer, and its docs now say newer models track multi-step work without a written list. OpenCode V2 dropped `todowrite` in July 2026 because "it slows agent down and we haven't noticed significant performance improvements". Pi never had one: "to-do lists generally confuse models more than they help". The exception is Claude Desktop, which in October 2026 gave its Code tab a plan of its own, for the view (see below).
- What people missed when it went was the view, not the agent's focus. OpenCode users filed issues asking for the list back so they could see what was pending and whether the agent had finished, and OpenCode put it back in October behind `experimental.todo`, mostly for the sidebar. The value has moved from the model to the person watching.
- Lists worked as recitation. Manus had the agent rewrite a `todo.md` so the goal sat at the end of the context, where models attend most. Cline's Focus Chain re-injects the list every 6 messages, and Factory gave the same reason for its plan tool on Terminal-Bench. That mattered more when models drifted after 50 tool calls.
- The cost is real. Manus found about a third of all actions were updates to the list, and replaced it with a separate planner agent. Claude Code nags the model when it hasn't touched the list in 10 replies, which says how often models forget to keep it current.
- One controlled study measured it. An empirical study of harness design (September 2026) switched a plan tool on and off across four models on SWE-bench Verified and Terminal-Bench 2.1. Planning raised a 30B model's success by 11.6 points. For the stronger models it changed accuracy little (−2.0 and −0.4 points) but cut cost by about 30%, mostly by ending the run before the extra verification turns. So a plan helps a weak model and makes a strong one stop sooner.
- Declared plans often aren't followed anyway. In a study of plan-then-act agents, only 22–45% of runs kept the structure of the plan they declared, and the longer the plan, the less they kept it. A list on screen can show a route the agent isn't really taking.
- Planning when needed beats planning up front. ADaPT tries the task directly and only splits it into a short 3–5 step plan when the attempt fails, and beat ReAct and plan-and-execute baselines by up to 28, 27, and 33 points on its three benchmarks. Its authors keep plans short because a detailed plan made before exploring builds on wrong guesses. Codex's prompt says the same in its own words: keep steps to 5–7 words, and when the plan changes, say why.
- Goals are taking over from steps. Codex's `/goal` (May 2026) stores one objective with how to check it's done, keeps working across turns until the evidence says so, and leaves the path open. Windsurf runs a bigger model in the background that keeps refining the plan while the main model acts, and tells you when the plan changed.

So a fixed list is going out for good models, the part worth keeping is what it shows you, and the shape that fits a plan that evolves is a fixed goal with an open path.

## How others do it

| App | What the agent keeps | Where you see it | Now |
| --- | --- | --- | --- |
| Claude Code CLI | TodoWrite, then Tasks with dependencies, stored in files and shared between sessions | Under the spinner | Off for the newest models |
| Claude Desktop | `update_plan` and `wrap_up`, tools of the app's own `ccd_turn` server | A plan box under the latest message, a next-step box at the end of a turn, and a session rail of cards | Shipped October 2026, with many complaints |
| Claude Code `/recap` | Nothing; the fast model writes it on return | One line after 5 minutes away: the goal, the current task, the next action, under 40 words | Shipped |
| Codex | `update_plan`: the whole list each time, one step in progress, a reason when it changes | Inline in the transcript | Kept; not allowed in Plan mode |
| Codex `/goal` | One objective, done criteria, a token budget | A goal row above the composer: pursuing, blocked, achieved | Shipped |
| OpenCode | `todowrite`, the whole list each time | Sidebar under Context and Modified Files, folded past 2 items | Removed in V2, back behind a flag |
| Amp | Nothing | Nothing | Removed |
| Pi | Nothing; a `TODO.md` if you want | The file | By design. Its example todo extension keeps the list in tool results, so a branch gets the list as it was at that point |
| Cursor | To-dos inside a plan that is a Markdown file you edit | Plan editor, to-dos can go to new agents | Weak on non-Anthropic models; off for GPT-5 for a while |
| Cline | Focus Chain, an editable Markdown checklist | Task header | On by default, re-injected every 6 messages |
| Windsurf | A plan file a bigger model keeps refining | Plan file, with a notice when it changes | On by default |
| Augment | Tasklist with subtasks you can edit, reorder, and run one by one | A Tasks tab next to Changes, with the diff per task | Shipped |
| Conductor | Your to-dos for the workspace; `@todos` shows them to the agent | Checks tab with git status, PR, CI, comments, and to-dos; open to-dos block merge | Shipped |
| Devin | A plan, synced to Linear | Session Insights after the run: a timeline of issues and progress | Shipped |

## Claude Desktop's new Code tab

The Claude Desktop update of 13 October 2026 rebuilt the Code tab around three things.

- A session rail on the right of the conversation: cards for the environment (folder, branch, Remote Control), context, connectors, outputs, changes (with the pull request controls, moved there from a bar above the composer), servers, and background tasks. Right-click a card's header to pick which show.
- A plan box under the latest message. The model keeps it with `mcp__ccd_turn__update_plan`, a tool the app injects only into desktop sessions, so the CLI's rule against to-dos on new models doesn't apply. The plan goes out with the first tool call of a turn. To move on, the model sends `{"advance": true}` alongside the call that starts the next step, never as a call of its own, so a step costs no extra turn.
- A next-step box at the end of a turn. Every turn that kept a plan, changed files, or ran commands must end with `mcp__ccd_turn__wrap_up`: a 2–3 sentence recap, and when there's a decision, one short question with one or two buttons and "New task" cards that start another session. It also ticks off what's left of the plan.

The issues filed in the first two weeks are the useful part:

- The plan scrolls away with the message it's under, so people asked for it in the rail, folded to one line like `Tasks 2/5 · Run the migration`, next to the cards that stay in view.
- With Sonnet 5.5 the plan is often skipped, or step 1 spins for the whole turn and everything flips to done at `wrap_up`. A plan written with the first call, before the work is known, comes out coarse, so one step spans a dozen calls with no point to advance.
- The recap replaces the answer. The model writes "I made a proposal, should I implement it?" without ever showing the proposal, because the tool says to keep it brief and write nothing after it. Rules in CLAUDE.md didn't stop it; people block the call with a hook.
- Two buttons frame decisions too narrowly, hide the message behind each button, and push you to click instead of discuss. The box can't be turned off, and it pushes the app's own next steps over a project's workflow.
- A card that's always there, the Environment card, can't be hidden, and in split view the rail takes a third of each pane.

What to take: a rail of cards for one session is the right home, the plan belongs there and not in the transcript, and the cheapest plan tool rides along with other calls. What to avoid: a recap the agent writes in place of its reply, and buttons that stand in for a question.

## What Bica already has

Most of what such a tab would show is already stored, and costs the agent nothing.

- Every tool call carries a summary of what it is for ([tools.md](../tools.md)), so the done half of a to-do list already exists as a trail of intentions. The latest summary is what the agent is doing now.
- Edit and write calls name the files this session changed, which is option 2 in [ui-hierarchy.md](./ui-hierarchy.md).
- Bash calls that run checks or tests have exit codes.
- Child sessions, terminals, questions, answers, context, and spend are all per session.
- The fast model already names sessions, so it can write a recap.
- Pi Durable documents give a session its own state that forks see as it was at the fork, as Pi's todo example does with tool results.

## Options

Two real ways to fill the plan part of the Recap tab, plus two smaller ideas that can sit next to either.

### A. The agent keeps a plan

Claude Desktop's shape, with its reliability hole fixed. The agent gets a plan tool: the plan goes out with its first call, and `{"advance": true}` rides along with the call that starts the next step, so a step costs no extra turn. No nag. Bica ticks off open steps itself when a run ends, so nothing spins forever, and each step shows the tool calls made under it, so a stale plan is obvious. It lives folded in the tab, `2/5 · Run the migration`, never under the message.

It costs the agent a prompt section and a few tokens per step, and the plan is only as true as the agent's discipline: Claude Desktop's plans get skipped or never advance. It also brings back the lock-in this started from, a little.

### B. The fast model reads the session

The agent keeps nothing. When the tab is open, the fast model reads a timeline of the session and writes where it stands: the goal, what it's doing now or waiting for, what's done, and what likely comes next. The timeline is your prompts, the agent's replies, and one line per tool call with its name and summary; tool inputs and outputs stay out, since the summaries already say what each call was for. Counts that need no model come straight from the transcript: files the edit and write calls touched, tool calls by tool, failures, prompts, and duration.

The plan can't lock the agent in, because the agent never sees it, and it evolves by construction, since each recap is written fresh. This is Windsurf's background planner and Manus's planner agent without the agent reading it back. The cost is the fast model's, and the risk is a wrong guess at the next steps.

A prototype is built: the Recap tab ([recap.md](../recap.md)). Each recap shows its model, tokens, cost, and time while this is an experiment. On a test session with Haiku 5.5 as the fast model, a 27-call session took about 2k tokens and 2 seconds, well under a cent.

The decision model, a classifier, can't write the recap, since it only answers typed questions. It could add cheap labels next to it, such as the phase (exploring, editing, checking, waiting) or whether the agent looks stuck.

### Next to either

- A goal. You, or the agent, set one objective with how to check it's done. It sits at the top of the tab, goes to the agent at the end of its context, and ends only on evidence, as Codex's `/goal` does. It fixes where the session is going and leaves the steps free. It overlaps with [night runs](../night-runs.md), which already run work to an end alone.
- Your checklist. Items you add for the session or workspace, which the agent sees when you mention them and which hold back archive or merge, as Conductor's to-dos do. It's the one list that stays fixed on purpose, because it's yours.

## Pick

Try B first: it needs nothing from the agent and can be thrown away without touching a session. If its "Likely next" guesses miss too often, try A on the same sessions and compare. Add a goal after, and keep the checklist for when worktrees and pull requests make merge readiness matter ([work-lifecycle.md](./work-lifecycle.md)).

## Open questions

- Files changed through bash don't show up in edit and write calls. Git status covers them at the workspace level only.
- While a run goes, the prototype writes a new recap at most every 15 seconds once something new happened. A slower pace let a fast run outgrow its "Likely next". Whether that pace costs too much on long runs is open.
- Whether the recap should also feed the sidebar row, the Needs you list, or a recap when you come back, as Claude Code's `/recap` does.
- Whether the tab replaces the session scope question in [ui-hierarchy.md](./ui-hierarchy.md), or adds to it.
- On the phone, the tab could be a sheet from the top bar instead.
- Bica could measure its own sessions before deciding on 5: turns and tokens with and without a plan tool, on the same kind of task.

## Sources

- Amp, TODOs Are Done: https://ampcode.com/news/todos-are-done
- Claude Code, Todos into Tasks: https://www.techtwitter.com/articles/were-turning-todos-into-tasks-in-claude-code
- Claude Code v2.1.233, to-do tools off for new models: https://www.claudeupdates.dev/version/2.1.233
- Claude Code, track todos (Agent SDK): https://code.claude.com/docs/en/agent-sdk/todo-tracking
- Claude Code, TodoWrite reminder text: https://harness.dtmont.com/claude-code/system-reminders/
- Claude Code, session recap: https://code.claude.com/docs/en/whats-new/2026-w17
- Claude Desktop, session details panel and panes: https://code.claude.com/docs/en/desktop
- Claude Desktop changelog, the new Code tab: https://claude.com/docs/cowork/changelog
- Claude Desktop issues: the plan in the rail https://github.com/anthropics/claude-code/issues/103038, the plan skipped or never advanced https://claudeissues.com/issue/102600-bug-desktop-app-task-list-plan-is-skipped-or-never-advances-mid-turn, the recap replacing the reply https://github.com/anthropics/claude-code/issues/103169 and https://github.com/anthropics/claude-code/issues/102132, the next-step box https://claudeissues.com/issue/102273-feature-desktop-app-code-tab-end-of-turn-next-step-box-with-1-2-answer-buttons-g and https://github.com/anthropics/claude-code/issues/104245, the rail in split view https://claudeissues.com/issue/102233-desktop-session-info-panel-environment-card-cant-be-hidden-and-wastes-width-in-s
- A worklist pane mod for Claude Code: https://blog.technowobble.com/2026/10/a-worklist-pane-for-claude-code.html
- OpenCode, removing the todo tool: https://github.com/anomalyco/opencode/pull/35989, and the issue asking for it back: https://github.com/anomalyco/opencode/issues/42421
- OpenCode, todos in the TUI sidebar: https://github.com/anomalyco/opencode/pull/56948
- Mario Zechner, no built-in to-dos in Pi: https://www.mariozechner.at/posts/2025-11-30-pi-coding-agent/
- Pi, todo and plan-mode example extensions: https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions
- Codex prompt and `update_plan`: https://github.com/openai/codex/blob/main/codex-rs/core/prompt.md
- Codex Goals: https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
- Manus, context engineering and recitation: https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus, and the move to a planner agent: https://yuntaozhang999.github.io/context-engineering-for-ai-agents-with-langchain-and-manus/
- Cline, Focus Chain: https://cline.bot/blog/focus-attention-isnt-enough
- Factory, Droid on Terminal-Bench: https://factory.ai/news/terminal-bench
- Windsurf, Planning Mode: https://devin.ai/blog/windsurf-wave-10-planning-mode
- Cursor, Plan Mode: https://cursor.com/blog/plan-mode, and to-dos off for GPT-5: https://forum.cursor.com/t/gpt-5-refuses-to-create-a-task-list/128436
- Augment, Tasklist: https://docs.augmentcode.com/using-augment/tasklist
- Conductor, Checks and Todos: https://www.conductor.build/docs/reference/checks
- Devin, Session Insights: https://docs.devin.ai/product-guides/session-insights
- An Empirical Study of Harness Design for Coding Agents: https://arxiv.org/abs/2609.20804
- Do LLM Agents Execute the Plans They Declare?: https://arxiv.org/html/2609.38108
- ADaPT, as-needed decomposition and planning: https://arxiv.org/abs/2311.05772
- Evaluating Goal Drift in Language Model Agents: https://arxiv.org/abs/2505.02709
