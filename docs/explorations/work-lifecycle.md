# Work lifecycle: from investigation to cleanup (brainstorm)

This is a brainstorm, not a spec. Cleaning up a worktree and keeping its branch and PR on the archived sessions are built, see [projects.md](../projects.md); the ideas below are what's left. It looks at how a piece of work moves from a first question to a merged pull request, where Tau helps today, where it leaves me stuck, and what other tools do about it.

## The lifecycle

Work goes through the same stages whichever way the code is kept apart:

1. Investigate. A question in the main folder, with no card and no branch yet.
2. Commit to it. A Jira card, a branch, or both appear, and the session should move into that context.
3. Build. One or more sessions edit, run, and commit.
4. Try it. Run the change for real, often from the main folder, where the heavy dev stack already runs.
5. Review. Push, open a pull request, react to review comments and CI.
6. Wrap up. The PR merges or closes, and the folder, branch, and sessions should go away without losing anything.

There are three ways to keep work apart, and each stage looks different in each:

- Main folder: one checkout, one branch at a time. Simple, but only one piece of work at a time.
- Worktree: one folder and one branch per piece of work. The folder is the unit.
- GitButler: one folder with many branches (lanes) applied at once. The lane is the unit.

## Where Tau stands today

- Investigate: works. A session in the main folder has no branch, which is fine.
- Commit to it: works for GitButler, where the lane appears on the first edit. A main-folder session can't move into a new worktree; I have to start over in a new session.
- Build: works. Sessions, terminals, Git and Butler panels, drafted commit messages.
- Try it: missing. A parked worktree has no "try this in the main folder" action, and the main folder has no "pull the merged main" nudge.
- Review: half. The PR badge shows the number and state, found by branch name. Creating the PR, CI status, and review comments live on GitHub.
- Wrap up: works for worktrees, one at a time. Clean up removes the folder and branch, archives the sessions, and asks first when work would be lost. Merged worktrees still wait in Parked until cleaned up by hand, and GitButler lanes have no clean up.

## What other tools do

- Conductor treats a workspace (worktree plus branch) as the unit that carries chats, diff, PR state, and archive. It has setup, run, and archive scripts per repo, and "files to copy" for gitignored files like `.env`. Its Spotlight button syncs one workspace's tracked changes into the repo root, as a checkpoint commit, so the dev server already running in the root hot-reloads it. Switching Spotlight to another workspace swaps the root over. New workspaces can start from a branch, a PR, or a GitHub or Linear issue.
- Codex app has Hand off, which moves a thread and its code between the local checkout and a worktree in either direction, doing the git steps (a branch can only be checked out in one place). Sync with local copies changes over by overwrite or by applying the patch since the shared commit.
- Cursor has `/worktree` to move the rest of a chat into a new worktree, `/apply-worktree` to bring the result into the main checkout for testing, and `/delete-worktree`.
- Claude desktop gives every session a worktree and has auto-archive when the PR merges or closes, which removes the worktree. A known bug: manual archive force-deletes worktrees with uncommitted work, with no warning. That is the failure to avoid.
- Superset creates workspaces from a new branch, an existing branch, or a PR, imports worktrees made elsewhere, and shows a board with states including Merged and Deleted. Its advice: removing the worktree keeps the branch; delete the branch once its work is merged.
- Vibe Kanban starts from a task card, runs a setup script, and has Archive (keeps the worktree) versus Delete (removes it). It promised cleanup on merge and then dropped it.
- Sculptor's Pairing mode syncs an agent's copy into the local repo both ways, so the IDE and the dev server see it live.
- GitButler's own answer to "try it" is apply and unapply: every applied lane is already in the folder.

The common pattern: the unit of work is a branch with a PR and a card attached, the folder is disposable, and the conversation outlives both.

## Ideas

### 1. The branch is the identity, not the folder

A session belongs to a folder. Clean up already notes the branch and PR on each archived session, but only at that moment. Record the branch when it is first seen in a worktree or lane instead (the lane is already in `.data/lanes.json`). Then archived sessions could group under "AFS-66263 dl-checks · merged #11439" whatever happened to their folder.

### 2. Move a session into a worktree

The missing step between investigating and building. In a main-folder session, "Move to new worktree" makes the worktree from the fast model's name (as today), carries uncommitted changes over (stash in main, apply in the worktree), and moves the session's folder. The agent learns its new folder with the next prompt, the same way it learns a new lane. Also "Start from…" in the workspace picker: an existing branch, a PR number, or a Jira key, which names the branch `AFS-1234-short-title` and puts the card's text in the first prompt.

### 3. Try it in the main folder

The main folder runs the heavy dev stack, so that is where trying should happen. On a parked or active worktree: "Try in main folder". It needs a clean main folder, then runs `git checkout --detach <branch>` there (detached, since git won't check out a branch twice). The main folder's header then says "Trying vali-AFS-66990 · Back to main". Later this could follow the worktree as it changes, like Spotlight. For a merged PR the action is simpler: "Pull main" in the main folder, shown when it is behind `origin/main`. GitButler needs none of this, since all lanes are already applied.

### 4. Parked sorted by what it needs

Group the Parked rows by state, with the action on the row:

- Merged or closed: "Clean up", and "Clean up all" when there are several.
- Needs me: CI failed, changes requested, or uncommitted changes left behind.
- Waiting: open or draft PR.
- No PR: "Open PR", or remove if empty and old.

### 5. Clean up for GitButler, and in bulk

Worktree clean up exists. For GitButler, `but pull` already drops integrated lanes; Tau would then archive the sessions that were on them and clear their lane records. An "auto clean up merged" setting could follow, only for clean workspaces.

### 6. Pull requests from Tau

"Open PR" next to Push: push, then `gh pr create` with a title and body drafted by the fast model from the commits and sessions, the same way commit messages are drafted. Later, the badge can show CI and review state, and review comments can go back to the session.

## A first slice

Smallest steps first, each useful alone:

1. Try in main folder and Pull main (idea 3).
2. Move to new worktree (idea 2).
3. Parked grouped by state, then Open PR (ideas 4 and 6).
4. Clean up for GitButler lanes (idea 5), and the branch recorded when first seen (idea 1).
