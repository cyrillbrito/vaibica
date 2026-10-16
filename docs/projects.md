# Projects and workspaces

A project is a folder on the dev machine you want agents to work in, usually a git repo. A workspace is the exact folder a session runs in: the project's main folder, or one of its git worktrees. Worktrees exist so parallel agents never step on each other's files.

```
Project  tau
├─ main folder        ← sessions: "fix sidebar", "hi"
├─ worktree: projects ← sessions: "add project picker"
└─ worktree: diffs    ← sessions: "changes panel"
```

## Adding a project

Add project opens a folder browser on the server, starting at the home folder, with git repos marked. The list of projects is a small JSON file you can edit by hand. Whether a project uses git is checked live, since a folder can become a repo later.

## Where a session starts

The home page's workspace picker is a search over every project's folder and worktrees, with its pull request badge and when a session last ran there. A branch, folder, ticket key, or pull request number finds it in any project. With the field empty, the four most recently used places come first. Under Projects, each project's row is its main folder, and its worktrees hang under it on a guide line, newest first. The + Worktree on a project's row, or ⌘Enter on it, starts in a new worktree instead. A matching worktree keeps its project's row above it while searching. On the phone it is a bottom sheet. Pages and menus that open a workspace also offer a new session there: the project page's composer, New session in… in the [command palette](./command-palette.md), and the + on its sidebar row.

## Worktrees

- Git is the source of truth. Worktrees made in a terminal show up too, and adding a worktree's folder as a project selects it in its repo's project instead.
- A session's workspace is just its folder. Nothing else links them.
- New worktree in the home page's workspace picker makes one per session. The fast model names the session on send, and that name becomes the branch and a sibling folder. The branch starts from the freshly fetched default branch, such as `origin/main`, or from local `main` when it holds unpushed work on top, and pushes to its own name. The project's name is dropped from the front, so Dever gets `dever-ui-polish`, not `dever-dever-ui-polish`.
- Setup runs in a terminal in the new worktree: the project's `setup` command, or an install guessed from the lockfile.
- Clean up deletes a worktree's folder and local branch, archives its sessions, and closes its terminals. It first checks for uncommitted files or commits no other branch has, local or pushed, and asks before losing them. So a branch merged into local `main` cleans up without asking. A branch whose pull request holds the same commit counts as saved, since squash merges leave the commits out of `main`.
- Archived sessions keep their branch and pull request badge after the folder is gone.

## Chats

A chat is a session with no project. Each starts in a new empty folder in `~/.tau/chats`, with its own git repo, so the agent can still write files without any project's context. Chats are a built-in project listed last in the sidebar, as one flat list. Archiving a chat keeps its folder.

## Pull requests

Each branch shows its pull request next to it, with its number and state (open, draft, merged, or closed). A click opens it on GitHub. The server asks the GitHub CLI (`gh`) for your own recent pull requests in the background, at most once a minute, and matches them by branch name. Only yours count, since someone else's branch named `main` would be a false match. Without `gh`, nothing shows and nothing breaks.

## The sidebar

The sidebar starts with the [hub](./hub.md), then groups sessions by project and workspace, with each workspace's terminals and kept files above its sessions.

Its header holds the τ! menu (new session, add project, settings, and the theme), the [command palette](./command-palette.md) (⌘K), and a + for a new session. The top bar's button hides the sidebar (⌘B). Under it, tabs filter the sessions; see [sessions.md](sessions.md#status).

- A workspace's header (its branch, or the project's name when it is alone) opens its page: the workspace card, files, and Git. It stays lit while that page is open.

- Drag a project's header to reorder projects: with the mouse right away, on touch after the long press that opens its menu. While dragging, every project shrinks to its header and a line shows where it lands. The order is saved in `.data/projects.json`. Chats stays last. Sessions stay sorted by time and don't drag.
- Branch names drop any prefix up to the last slash, and a leading ticket key shrinks to a small tag. The tag opens the ticket when the project has a `tickets` link in `.data/projects.json`.
- Workspaces with no open sessions or terminals drop into Parked, one line each, so a worktree waiting on review stays out of the way. Starting a session there moves it back up.
- Archived sessions sit in a collapsed section at the bottom.
- A worktree with no branch shows its folder without the project's name in front, so `tau-sidebar` is listed as `sidebar`. Its note (detached, folder removed) always stays visible.
- Kept files with the same name show the parent folders that tell them apart. Times older than a month become a date.

## Safety

The folder browser can list any folder the server's user can read. That is fine only because the server is reached from localhost or a private network.

## Sources

- Conductor searches workspaces by branch, repo, or PR number, and starts one from a branch or PR: https://www.conductor.build/changelog/0.26.0-search-workspaces-view-files-from-chat
- Superset's branch picker searches and puts an Open action on rows that already have a worktree: https://github.com/superset-sh/superset/pull/3397
