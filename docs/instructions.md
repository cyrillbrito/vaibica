# Instructions and skills

The agent's instructions are prompt sections that Pi Durable renders before every request, so edits apply to running sessions. It sends only the sections that changed, so editing `AGENTS.md` or a skill rewrites the prompt cache from that section on, not from the start. They are built like the Pi coding agent's, in `src/server/profiles/instructions.ts`.

They say what Bica is, give a few house rules (git stays read-only unless asked, anything long-running goes in a terminal, UI changes get checked in a browser), and add the instruction files: your `~/.bica/AGENTS.md`, then the `AGENTS.md` or `CLAUDE.md` of each folder from the root down to the workspace, under Pi's file names. Bica never reads Pi's `~/.pi` files. [Assistant mode](./assistant-mode.md) adds its memory rules. The [hub](./hub.md) gets instructions of its own instead.

## Skills

Skills are Agent Skills folders, each with a `SKILL.md`. Only their names and descriptions go into the instructions, and the agent reads a skill when it might fit. On a name clash the first found wins, so your copy overrides Bica's:

1. The workspace's `.agents/skills`, `.claude/skills`, and `.bica/skills`.
2. Your `~/.agents/skills`, `~/.claude/skills`, and `~/.bica/skills`.
3. Bica's own `skills/`.

Skills marked `disable-model-invocation` are left out, since there are no slash commands.

## Short replies

The instructions end with rules for how the agent replies, since replies are read on a phone between sessions. They give the reason as a fact about the reader, because a preference like "be concise" gets traded away and a fact doesn't. They set hard limits: usually 2 to 6 lines, one list of up to 5 points, no headings or bold labels. Without numbers, replies to long dictated prompts doubled. A dictated message that asks several things gets the main answer in full and the rest in a sentence each. A named list of exceptions, such as "explain" or a destructive action, keeps the model from inventing its own. A check before sending asks whether the first and last lines alone say what happened and what to do next.

The rules sit last in the prompt, after `AGENTS.md` and the skills, where they weigh the most.

## Shipped skills

Bica ships three skills: [Ponytail](https://github.com/DietrichGebert/ponytail), for the laziest code that works, `agent-browser`, the CLI's own guide, trimmed, and `dever`, which says what runs in Bica and what in Dever (`~/Repos/dever`), the dashboard that keeps this machine's services up. Copy `agent-browser` again after upgrading the CLI.

## Sources

- [i-have-adhd](https://github.com/ayghri/i-have-adhd): the shape of the reply rules, the limits, and the check before sending.
- [caveman](https://github.com/JuliusBrussee/caveman): answer first and cut ceremony, without its broken grammar.
- [unslop](https://github.com/theclaymethod/unslop) and Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing): say what something does, not how it feels.
- The [Codex system prompt](https://github.com/openai/codex/blob/main/codex-rs/core/prompt.md): short flat lists ordered by importance, and replies sized by the task.
- Anthropic's [prompting best practices](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices): say what to do rather than what not to do, and repeat a short reminder near the end of a long prompt.
