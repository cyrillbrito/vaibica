# Writing

How to write docs, comments, and commit messages in this repo. The code is readable, so prose only adds what the code can't say.

## Everywhere

- Point first. The first sentence says what the thing is or what happened.
- Plain words and full sentences, one idea per sentence.
- Flat lists without bold labels. No nested bullets.
- Cut anything a reader can get faster from the code: names of functions, constants, file walkthroughs.
- Say it once. If two places explain the same thing, keep the better home and link to it.

## Docs

`docs/` is the user manual of what exists today. Each doc covers one feature or area: what it is for, what you see, what happens, and why it works this way. Keep it short enough to read in a minute or two.

- Describe the present. No history, no plans, no "not yet" lists. Plans live in the Next section of `AGENTS.md`.
- Leave out values that live in code and get tuned: thresholds, delays, limits, counts, and default models. Say what the value does ("a long paste folds", "past a size, a nag appears") and let the code hold the number. Numbers stay only when they are a fact outside the code, such as a provider's price or a measured result, or a design token in `UI.md`.
- Link one or two main files at most. Don't walk through code.
- A feature borrowed from other apps or studies ends with its sources.
- Add new docs to the index in `AGENTS.md`, with when to read them.
- Link related docs where a reader would need them, so the docs form one graph.
- Write tables unpadded, `| a | b |` and `| --- | --- |`. Agents read these files, and aligned columns spend tokens on spaces. Oxfmt keeps them so: its Markdown override (`proseWrap: "never"` with `printWidth: 1`) makes every aligned table too wide, and too-wide tables print compact.

`docs/explorations/` is the opposite: research, brainstorms, comparisons, and prototypes for what is not built yet. It can be longer and open-ended, and gets a line in the index in `AGENTS.md`. Write one only when asked: a question gets its answer in the reply. When an idea gets built, its doc in `docs/` describes what was built and links the sources that inspired it, and the exploration is deleted.

## Comments

Comments are rare and say why, never what. Write one when the code alone would mislead: a workaround, a constraint from a library or platform, a choice that looks wrong but isn't, or a link to the doc behind a feature. A comment that repeats the code goes.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/): a type prefix such as `feat:`, `fix:`, `chore:`, `docs:`, or `refactor:`, then one short lowercase summary of what the commit does for the user, not which files changed. For example, `feat: drag sessions between projects`.
