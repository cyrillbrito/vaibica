# Git

The right panel's Git tab is where you stage, commit, and push the agent's work. It is modelled on VS Code's source control.

## The Git tab

- The branch row offers pull (fast-forward only), push, or publish for a new branch.
- Commit takes what's staged, or everything when nothing is staged. Commit and push, and amend, are extra actions.
- Staged and Changes list files with line counts. Clicking one opens its diff, and its menu stages, unstages, or discards it.
- Recent commits are listed below.

Diffs open full size on the project page ([files.md](./files.md)), and compare the same things as VS Code: a staged file against the last commit, and a changed file against what's staged. Stage on view, a setting that is off by default, stages a file when you open its diff, so staging becomes a review marker. Whatever the agent writes afterwards shows up under Changes, holding only the new part.

A submodule is its own repo, so it gets its own section with the same parts while it has changes or commits to push or pull. In the parent's section it is one entry, listed when it points at another commit.

## Commit messages

With a fast model ([models.md](./models.md)) set, an empty commit box means "write it for me": Commit has the model write the message and commits. Write drafts it into the box first, for review: the draft fades in, Rewrite asks for another, and Undo puts back what you had typed.

Commit, push, and pull show a toast whose spinner turns into a check or a cross, and the Commit button draws a check for a moment once it went through. Staged and Changes show their lines added and removed, rolling as files move.

The model writes one short line that says what the commit does. It works from the diff, the repo's recent commit subjects so it copies their style (Conventional Commits when they show none), and the prompts you gave agents in this workspace, which hold the why that a diff can't show.

## Folders without git

Adding a project folder that has no git runs `git init` in it, and so does every new chat folder ([projects.md](./projects.md#chats)), so the Git tab covers them like any repo. A folder inside another repo is left alone. Any other folder without `.git` has no Git tab until you run `git init` in it.
