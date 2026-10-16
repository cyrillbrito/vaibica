# Instructions and skills

The agent's instructions are prompt sections that Pi Durable renders before every request, so edits apply to running sessions. It sends only the sections that changed, so editing `AGENTS.md` or a skill rewrites the prompt cache from that section on, not from the start. They are built like the Pi coding agent's, in `src/server/profiles/instructions.ts`.

They say what Bica is, give a few house rules (git stays read-only unless asked, anything long-running goes in a terminal, never restart a dev server you didn't start), and add the instruction files: your `~/.bica/AGENTS.md`, then the `AGENTS.md` or `CLAUDE.md` of each folder from the root down to the workspace, under Pi's file names. Bica never reads Pi's `~/.pi` files. Each [profile](./profiles.md) picks its sections: [assistant mode](./assistant-mode.md) adds its memory rules. The [hub](./hub.md) gets instructions of its own instead.

## Skills

Skills are Agent Skills folders, each with a `SKILL.md`. Only their names and descriptions go into the instructions, and the agent reads a skill when it might fit. Bica ships none of its own. On a name clash the first found wins, so a workspace's copy overrides yours:

1. The workspace's `.agents/skills`, `.claude/skills`, and `.bica/skills`.
2. Your `~/.agents/skills`, `~/.claude/skills`, and `~/.bica/skills`.

Skills marked `disable-model-invocation` are left out, since there are no slash commands.

This repo's own skills come from GitHub through the [skills](https://skills.sh) CLI, pinned in `skills-lock.json`. Install with `bunx skills add <owner/repo> -s <skill> -a pi`, which writes to `.agents/skills`, and refresh with `bunx skills update -p`.

## Short replies

The instructions end with rules for how the agent replies, since replies are read on a phone between sessions. They give the reason as a fact about the reader, because a preference like "be concise" gets traded away and a fact doesn't. They set hard limits in numbers, on lines and list points, and ban headings and bold labels. Without numbers, replies to long dictated prompts doubled. A dictated message that asks several things gets the main answer in full and the rest in a sentence each. A named list of exceptions, such as "explain" or a destructive action, keeps the model from inventing its own. A check before sending asks whether the first and last lines alone say what happened and what to do next.

The rules sit last in the prompt, after `AGENTS.md` and the skills, where they weigh the most.

## Sources

- [i-have-adhd](https://github.com/ayghri/i-have-adhd): the shape of the reply rules, the limits, and the check before sending.
- [caveman](https://github.com/JuliusBrussee/caveman): answer first and cut ceremony, without its broken grammar.
- [unslop](https://github.com/theclaymethod/unslop) and Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing): say what something does, not how it feels.
- The [Codex system prompt](https://github.com/openai/codex/blob/main/codex-rs/core/prompt.md): short flat lists ordered by importance, and replies sized by the task.
- Anthropic's [prompting best practices](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices): say what to do rather than what not to do, and repeat a short reminder near the end of a long prompt.
