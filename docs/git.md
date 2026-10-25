# Git

The [side panel](./layout.md)'s Git tab is where you stage, commit, and push the agent's work. It is modelled on VS Code's source control.

## The Git tab

- The branch row offers pull (fast-forward only), push, or publish for a new branch.
- Commit takes what's staged, or everything when nothing is staged. Commit and push, and amend, are extra actions.
- Staged and Changes list files with line counts. A click opens the diff ([files.md](./files.md)), and the menu stages, unstages, or discards.
- Recent commits are listed below.

Stage on view, a setting, stages a file when you open its diff, so staging marks what you reviewed. Whatever the agent writes afterwards shows under Changes as only the new part.

A submodule gets its own section while it has changes or commits to push or pull.

## Commit messages

With a fast model ([models.md](./models.md#which-model-does-what)) set, an empty commit box means "write it for me": Commit has the model write the message. Write drafts it into the box first for review, and Rewrite asks for another.

The message is one short line that says what the commit does. The model works from the diff, the repo's recent commit subjects so it copies their style, and the prompts you gave agents in this workspace, which hold the why a diff can't show.

## Folders without git

New projects and chats without git get `git init`, unless they sit inside another repo. Any other folder without git has no Git tab.
