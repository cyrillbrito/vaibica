# Instructions and skills

The agent's instructions are prompt sections that Pi Durable renders before every request, so edits apply to running sessions. It sends only the sections that changed. Models that take system messages mid-conversation, such as Anthropic's, get the change added in place and keep the whole prompt cache. Other models get the prompt rewritten from that section on, so the sections that change least come first. They are built like the Pi coding agent's, in layers that every [profile](./profiles.md) shares, so a coding session and the hub are still the same Bica:

1. The opening says what Bica is and what this session does.
2. The tools the session has, one line each, and the rules that come with them, such as git staying read-only unless asked, never restarting a dev server you didn't start, and putting anything long-running in a terminal. Like Pi's tool snippets, a profile without a tool gets neither its line nor its rules.
3. Pi Durable's codemode section, as it ships: the declarations of the tools a script can call.
4. The instruction files: your `~/.bica/AGENTS.md`, then the `AGENTS.md` or `CLAUDE.md` of each folder from the root down to the workspace, under Pi's file names. Bica never reads Pi's `~/.pi` files. Then the memory index, the skills, and the folder.
5. Rules shared by kind: handoff rules for profiles that start and follow other sessions, and memory rules for the long-lived ones, [assistant mode](./assistant-mode.md) and the [hub](./hub.md).
6. The profile's own role, such as a [night run](./night-runs.md)'s rules to finish alone.
7. How to reply, below.

The shared parts are in `src/server/profiles/common.ts`, and each profile's own text is in its file next to it.

## Skills

Skills are Agent Skills folders, each with a `SKILL.md`. Only their names and descriptions go into the instructions, in the Pi coding agent's words and format, and the agent reads a skill when it fits. One line more tells it to read a skill again once Bica has cleared it from the context. Bica ships none of its own. On a name clash the first found wins, so a workspace's copy overrides yours:

1. The workspace's `.agents/skills`, `.claude/skills`, and `.bica/skills`.
2. Your `~/.agents/skills`, `~/.claude/skills`, and `~/.bica/skills`.

Skills marked `disable-model-invocation` are left out, since there are no slash commands.

This repo's own skills come from GitHub through the [skills](https://skills.sh) CLI, pinned in `skills-lock.json`. Install with `bunx skills add <owner/repo> -s <skill> -a pi`, which writes to `.agents/skills`, and refresh with `bunx skills update -p`.

## Short replies

The instructions end with rules for how the agent replies, since you run several sessions at once and skim each reply. They give the reason as a fact about the reader, because a preference like "be concise" gets traded away and a fact doesn't. They set hard limits in numbers, on lines and list points, and ban headings and bold labels. Without numbers, replies to long dictated prompts doubled. A dictated message that asks several things gets the main answer in full and the rest in a sentence each. A named list of exceptions, such as "explain" or a destructive action, keeps the model from inventing its own. A check before sending asks whether the first and last lines alone say what happened and what to do next.

The rules sit last in the prompt, after `AGENTS.md` and the skills, where they weigh the most. Every profile writes in the same style. The hub names files instead of spelling out paths, since you often listen to it, and a night run swaps the length limits for one morning report.

## Sources

- The Pi coding agent's [system prompt](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts): named sections, and tool lines and rules that come only with the tools a session has.
- [i-have-adhd](https://github.com/ayghri/i-have-adhd): the shape of the reply rules, the limits, and the check before sending.
- [caveman](https://github.com/JuliusBrussee/caveman): answer first and cut ceremony, without its broken grammar.
- [unslop](https://github.com/theclaymethod/unslop) and Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing): say what something does, not how it feels.
- The [Codex system prompt](https://github.com/openai/codex/blob/main/codex-rs/core/prompt.md): short flat lists ordered by importance, and replies sized by the task.
- Anthropic's [prompting best practices](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices): say what to do rather than what not to do, and repeat a short reminder near the end of a long prompt.
