# Getting back to a branch (exploration)

This is research, not a spec. It looks at going back to a parked branch, such as `vali-null-checks`, and starting a session there. Ideas 1 to 3 are built, see [projects.md](../projects.md#where-a-session-starts) and [files.md](../files.md); what is left is starting from a branch with no worktree, and the smaller things.

## What others do

- Conductor opens a picker with ⌘⇧N to start a workspace from a branch, a pull request, or an issue, in tabs. ⌘⇧F searches workspaces by branch, repo, or PR number. A workspace page carries its chats, diff, and PR state together.
- Superset's new workspace dialog starts from a new branch, an existing branch, or a pull request. Its branch picker has Branch and Worktree tabs with server-side search. Each row has its own action: Check out on a branch, Open on an existing worktree. Linking a PR searches by title or number, or takes a pasted URL.
- Superset's pull request list can, for a PR that already has a workspace, start a new agent session there, or make the workspace when there is none.
- Tau's own model picker is already a searchable popover grouped by provider, with a bottom sheet on the phone. The same pattern fits workspaces.

The common thread: the branch (or PR) is the thing you look for, search is on by default, and the place you land always has a "start here" action.

## Ideas

### 1. Start from an existing branch or pull request

For branches with no worktree yet, such as a teammate's PR or a branch cleaned up too early, the home page's workspace picker can list remote branches and your open pull requests below the workspaces. Picking one makes a worktree on that branch (`git worktree add` with tracking) instead of a new one from `main`. This is idea 2 of [work-lifecycle.md](work-lifecycle.md), and it fits in the same picker.

### 2. Smaller things

- Deep link: `/new?cwd=…` opens the home page with the target set, so links from a PR, a note, or the workspace page all land in the right place.
- Start a session from a PR badge's menu: "New session on this branch".

## Sources

- Conductor, workspaces and branches: https://www.conductor.build/docs/concepts/workspaces-and-branches
- Conductor 0.15.2, create workspace from PR: https://www.conductor.build/changelog/0.15.2-create-workspace-from-pr
- Conductor 0.26.0, search workspaces: https://www.conductor.build/changelog/0.26.0-search-workspaces-view-files-from-chat
- Superset workspaces: https://docs.superset.sh/workspaces
- Superset pull requests: https://docs.superset.sh/pull-requests
- Superset's branch picker with per-row actions: https://github.com/superset-sh/superset/pull/3397
