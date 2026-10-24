# What the side panel belongs to

An open question about the side panel. The workspace page is built ([files.md](../files.md)), but the panel next to a session still shows the whole workspace's Files and Git. Five sessions in one worktree show the same panel, so it reads as part of whichever session is open.

## Why it matters

- A panel docked next to the transcript reads as part of the session: things inside one boundary are read as one group ([NN/g, common region](https://www.nngroup.com/articles/common-region/)).
- Apple's inspectors and Figma's right sidebar show the selected thing, and fall back to its parent only when nothing is selected.
- Commit and push change a workspace, so a commit box next to a session suggests commit is a session action.

## What others do

- Claude desktop and Orca name the scope in the panel header: "main → update-packages".
- Codex's review pane has an explicit scope switch: uncommitted, staged, branch against base, a commit, or the last turn.
- OpenCode hit the same problem, a clean session showing another session's edits, and scoped its panel to the session's own changes ([PR #42290](https://github.com/anomalyco/opencode/pull/42290)).
- Conductor and Cursor give each agent its own worktree, so session and workspace become one.

## Options

1. Name the scope. A header on the panel with the workspace, branch, and PR badge. Cheap, and every other option needs it too.
2. A session panel. The panel shows only what this session changed, with a link to the whole workspace page. Plain git needs a record of the paths each session's edit and write calls touched; changes from bash stay at workspace level.

Start with 1, and do 2 once worktrees with several sessions get common.
