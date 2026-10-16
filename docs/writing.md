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
- Name a number only when it shapes the behavior, and call it a tunable constant.
- Link one or two main files at most. Don't walk through code.
- A feature borrowed from other apps or studies ends with its sources.
- Add new docs to the index in `AGENTS.md`.

`docs/explorations/` is the opposite: research, brainstorms, comparisons, and prototypes for what is not built yet. It can be long and open-ended, and has no index. Write one only when asked: a question gets its answer in the reply. When an idea gets built, its doc in `docs/` describes what was built and links the sources that inspired it, and the exploration is deleted.

## Comments

Comments are rare and say why, never what. Write one when the code alone would mislead: a workaround, a constraint from a library or platform, a choice that looks wrong but isn't, or a link to the doc behind a feature. A comment that repeats the code goes.

## Commit messages

One short line that says what the commit does for the user, not which files changed.
