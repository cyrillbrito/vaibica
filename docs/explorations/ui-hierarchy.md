# UI hierarchy: what belongs to what

This is exploration work. Nothing here is built. It looks at how Bica's layout should show that files and changes belong to a workspace while the transcript belongs to a session, compares how other tools handle it, and proposes four layouts.

The short answer: a panel next to a session reads as part of that session, so it should only hold things the session owns. Workspace things need a home of their own, the workspace page. The pick is option 4, two homes: a workspace page for Files, Git, and terminals, and a session panel that shows only that session's own changes, scoped the right way for plain git, GitButler, and folders without git.

## The problem

Bica's objects nest like this:

```
Project      vaibica (a repo, its settings, its pull requests)
└─ Workspace main folder or a worktree (files, git status, commits, terminals)
   └─ Lane   GitButler only: a branch applied in the folder (a share of the changes, commits, a PR)
      └─ Session  a conversation (transcript, queue, model, the changes it made)
```

Today the screen nests differently. The sidebar groups sessions under workspaces, which matches. But the center shows a session, and the right panel next to it shows the whole workspace's Files and Git. Five sessions in one worktree show the same right panel, so the panel looks like it belongs to whichever session is open, and it doesn't.

The panel has no header naming its owner. On the session page in the GitButler folder, the Butler tab shows every lane, including lanes other sessions work on, right next to one session's transcript. Nothing on screen says "this is vaibica, not this session".

The scope also changes by setup, and the panel switches content without saying so:

- In a plain worktree, the Git tab shows the whole folder's uncommitted changes. Usually one session works there, so the panel and the session happen to match.
- In a GitButler folder, the Butler tab shows every lane. The open session's own lane is one card among several.
- In a folder without git, the Changes tab shows only what the open session changed. Here the panel really is about the session, so the same place means a different scope.

## What research says

### Position implies ownership

- Gestalt proximity and common region say that things close together, or inside one boundary, are read as one group that shares something. NN/g puts it plainly: items within a boundary are assumed to share a characteristic or function ([common region](https://www.nngroup.com/articles/common-region/), and Stephen Palmer's 1992 paper that named it). A panel docked against the transcript, with nothing around both, is read as part of the session.
- Apple's guidelines define an inspector as a panel that shows the details of the current selection and updates when the selection changes ([Panels](https://developer.apple.com/design/human-interface-guidelines/panels)). They contrast it with an info window, whose content stays the same when the selection changes. Bica's right panel sits where an inspector sits, but behaves like an info window for the selection's parent.
- Figma follows the same convention. The left sidebar is structure (layers), and the right sidebar shows the properties of the selected layer. When nothing is selected, it falls back to the page ([right sidebar](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar)). The right side shows the parent only when no child is selected.
- Master-detail, also called list-details or a two-panel selector, works because people learn that selecting in one pane fills the next pane with that item ([Microsoft list/details](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/list-details), Tidwell's [Designing Interfaces](https://www.oreilly.com/library/view/designing-interfaces/0596008031/ch02s03.html)). Each pane to the right is read as a child of the selection to its left. Bica's three columns read as workspace, then session, then something inside the session.

### Objects need homes

- Object-oriented UX (Sophia Prater's ORCA process) starts from the objects in the user's mental model, their relationships, their actions, and their attributes, before any screen ([ORCA](https://ooux.com/resources/introducing-orca-the-third-diamond-in-your-ux-process)). Each object that has its own attributes and actions gets its own place, and relationships become navigation. For Bica, the workspace has attributes (branch, PR, changes) and actions (commit, push, clean up), so it deserves a real page. Today it has one only weakly, as the project page reached from a small icon.
- Actions belong at the level of the object they change. Commit, push, and pull change a workspace or a lane. Discarding a session's edits changes what that session did. A commit box next to a session suggests that commit is a session action.

### Say where you are

- NN/g's you-are-here guidance: every view should show where it sits in the hierarchy, with headings, highlighted navigation, and breadcrumbs ([you are here](https://www.nngroup.com/articles/navigation-you-are-here/), [local navigation](https://www.nngroup.com/articles/local-navigation/)).
- VS Code's docs say it directly for source control: before staging, committing, or syncing, check the repository name and branch, so the action goes to the intended checkout ([repositories](https://code.visualstudio.com/docs/sourcecontrol/repos-remotes)). A panel that acts on a scope must name the scope.

## What other tools do

The common pattern is that left is navigation and containers, center is the object you work on, and right is an inspector of that object. Tools that put workspace things on the right either make the session and the workspace the same thing, or name the scope in the panel header.

- VS Code puts workspace-scoped views (Explorer, Source Control) in the sidebar on the same side as navigation, as chrome around the editor. The editor is the child. In a multi-root workspace, the Source Control view lists repositories and lets you pick one or see all ([multi-root](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces)).
- JetBrains IDEs dock project-scoped tool windows around the editor. Changelists group uncommitted changes in one working copy into named sets you commit separately ([changelists](https://www.jetbrains.com/help/idea/managing-changelists.html)). That's the idea GitButler lanes grew from, shown as sections in one Commit window, which means one workspace view grouped by owner.
- Zed docks the project panel and the Git panel on the project window. The Git panel names the active repository and branch at its top ([Git](https://zed.dev/docs/git)), and multi-repo support is an open request for collapsible sections per repo.
- Cursor gives each agent its own worktree in the Agents Window, so each agent's changes are its own ([worktrees](https://cursor.com/docs/configuration/worktrees)). Session and workspace become the same thing.
- Claude desktop does the same: by default every session gets a worktree. Its diff panel header names the scope as "main → update-packages", and the diff stats chip sits above the composer (`docs/inspiration/claude-desktop/diff-panel.png`).
- Codex's review pane shows the repository's state, not just what Codex edited, and has a scope switch: uncommitted, staged, branch against base, a commit, or the last turn ([review](https://developers.openai.com/codex/app/review)). The scope is explicit and chosen, not implied by position.
- OpenCode hit Bica's exact problem. Its review panel showed the whole working tree, so a clean session showed files another session in the same folder was writing. The fix scoped the panel to the session's own changes ([PR #42290](https://github.com/anomalyco/opencode/pull/42290)). OpenCode also has a project home page listing sessions (`docs/inspiration/opencode-desktop/project-sessions.png`).
- Conductor makes the workspace (a worktree and its branch) the unit. Chats, diff, terminal, PR state, and archive all hang off the workspace ([workspaces](https://www.conductor.build/docs/concepts/git-worktrees)). The chats are children of the workspace in the UI as well.
- Orca lists worktrees in the sidebar, each with its branch and latest agent message. Sessions and files open as tabs inside the worktree, and the right panel header names the worktree ("vali") and the branch against `origin/main` (`docs/inspiration/orca/`).
- GitButler's own app shows one workspace with lanes side by side and the unassigned changes apart. Its Agents tab runs a Claude Code session inside a lane, so the session is a child of the branch ([Agents tab](https://blog.gitbutler.com/agents-tab)). Their newer UI moved lanes into vertical sections with a stack header, which is closer to a tree.
- T3 Code puts a scope picker at the top of its diff panel and the workspace and branch under the composer (`docs/inspiration/t3-code/`). Delta and Copilot also show the worktree and branch under the prompt.
- Linear nests workspace, team, project, and issue. An issue's side panel shows only that issue's properties, and project-level information lives on the project page, never in the issue's panel. Peek previews an item without leaving the list ([peek](https://linear.app/docs/peek)).
- herdr shows spaces (repo and branch) and agents as two separate lists, so the two levels never mix.

## One model for changes in every setup

The three setups look different, but they share one shape. A workspace's changes split into groups by owner, and a session has one group that is its own.

| Setup | Workspace changes, grouped by | A session's own changes |
| --- | --- | --- |
| Plain git, worktree or main folder | one group: the branch (staged and changes) | the uncommitted files its edit and write calls touched |
| GitButler | lanes, plus "not on a branch" | its lane, with the files it changed marked |
| No git | sessions, from the hidden snapshots | its snapshot diff, as today |

This is the same idea as JetBrains changelists and GitButler lanes, generalized: the workspace view is always the whole, grouped by owner, and the session view is always one group. It also gives an extension's version control system a clear job: provide the groups and say which group a session owns.

Provenance comes from records Bica already keeps. Lanes record which session wrote which file (`.data/lanes.json`). The shadow store records each session's snapshots. Plain git would need the same small record of the paths a session's edit and write calls touched. Changes from bash or by hand stay at workspace level, as "not by a session" or "not on a branch".

## Options

All four keep the left sidebar as is: projects, workspaces, sessions. They differ in where workspace things live and what sits next to a session.

### 1. Keep the layout, name the scope

The right panel stays as it is, but it gets a header that names its owner: the workspace name, branch, and PR badge, like Orca and Claude desktop. When the panel shows something session-scoped (Changes in a folder without git), the header names the session instead. The open session's lane is moved to the top of the Butler tab and marked "this session". Hovering or focusing the panel highlights the workspace group in the sidebar, linking the two through similarity.

- Plain worktree: the header reads "vaibica / ui-hierarchy · #42". Little changes in practice, since usually one session works there.
- GitButler: the header reads "vaibica · GitButler", and the session's lane comes first.
- No git: the header reads the session's title, so the scope switch is said out loud.
- Phone: the bottom sheet gets the same header.

Trade-offs: it's cheap and could ship this week. But proximity still beats a label. The panel still docks on the session, and the commit box still sits next to a transcript. It treats the symptom, and slots copied from it would freeze a layout we already know is off.

### 2. The workspace as a frame

The hierarchy becomes nested boxes. A workspace bar spans the center and the right panel, with the workspace name, branch, PR, Files, Git, and terminals. Its sessions sit inside it as tabs. The right panel hangs off the workspace bar, not the session, so common region shows that it belongs to the workspace. This is Conductor's and Orca's model.

```
┌ sidebar ─┐┌ vaibica / main · GitButler ─────────── Files  Git  Terminals ┐
│ projects ││ [ UI hierarchy ] [ Name ] [ Pi language ] +                      │
│ worktrees││ ┌ transcript ───────────────────┐ ┌ workspace panel ──────────┐ │
│ sessions ││ │                               │ │ lanes, files              │ │
└──────────┘└─┴───────────────────────────────┴─┴───────────────────────────┴─┘
```

- Plain worktree: one tab, usually, and the frame is the worktree.
- GitButler: tabs can be grouped or tinted by lane, and the panel shows all lanes, which is right since it belongs to the frame.
- No git: the panel's Changes is grouped by session, with the open tab's group first.
- Phone: the frame becomes a header with the workspace name and a session switcher, and the panel stays a sheet opened from the workspace header, not from the session.

Trade-offs: it fixes the reading through structure, not words, and it maps well to slots (`workspace.bar`, `workspace.panel`, `workspace.tab`). But it adds tabs, which Bica avoided on purpose, and a second bar of chrome on every screen. Switching between sessions in different workspaces, the most frequent action in Bica, now swaps the whole frame. The sidebar and the tab row list the same sessions twice.

### 3. A workspace page, no right panel

This is the idea from the problem statement, taken all the way. Clicking a workspace in the sidebar (or its name in the session's top bar) opens its page: Changes, Files, Commits, and Terminals as views of one workspace, with the file or diff full size. This grows today's project page into a real home. The session page loses the right panel completely. A chip in the session's top bar ("+204 −178") shows how much the session changed and opens the workspace page filtered to it.

```
Session page                         Workspace page
┌ sidebar ┐┌ transcript ──────────┐  ┌ sidebar ┐┌ vaibica / main ─ Changes Files Commits Terminals ┐
│         ││ vaibica / main    │  │         ││ ┌ lanes / changes ┐ ┌ diff, full size ──────────────┐ │
│         ││ +204 −178 ───────────┼─▶│         ││ │                 │ │                               │ │
└─────────┘└──────────────────────┘  └─────────┘└─┴─────────────────┴─┴───────────────────────────────┴─┘
```

- Plain worktree: the page is the Git tab grown up, with branch, commit, push, and PR on top.
- GitButler: the page shows lanes as sections, like GitButler's own app, with the whole worktree visible at once. The session chip opens it with the session's lane expanded.
- No git: Changes groups by session. The chip opens the session's group.
- Phone: the workspace page is a normal page with a segmented control for its views. The session page gets simpler, with no sheet.

Trade-offs: it's the cleanest hierarchy and gives the fewest columns, which also removes the drawer and sheet logic for the right panel. But glancing at changes while the agent works now takes a page switch. On a wide screen, the space to the right of a 720px transcript sits empty. And the session-level view of changes, which matters for GitButler and no git, exists only as a filter.

### 4. Two homes: a workspace page and a session panel (the pick)

Option 3's workspace page, plus a right panel that becomes a real inspector of the session. Everything the workspace owns moves to the workspace page. Everything next to the session is about the session: its own group of changes, its lane or branch, the terminals it started, and its context use. The panel header names the session's place ("on lane ui-hierarchy in vaibica") and links to the whole workspace.

```
Session page
┌ sidebar ──┐┌ transcript ────────────────┐┌ This session ─────────────────┐
│ vaibica││ UI hierarchy               ││ lane ui-hierarchy · vaibica│
│  sessions ││                            ││ 3 files  +120 −30             │
│ vault     ││                            ││ commit this lane              │
│  sessions ││                            ││ terminals it started          │
│           ││                            ││ Whole workspace →             │
└───────────┘└────────────────────────────┘└───────────────────────────────┘
```

- Plain worktree: the panel lists the uncommitted files this session touched, and a line such as "2 more changes in this worktree" links to the workspace page. Commit stays on the workspace page, because the branch belongs to the folder. With one session in the worktree, the panel and the page agree, which is fine.
- GitButler: the panel is the session's lane card, with its commit box, Push, and Land, since the lane is the level between and is what this session commits. Other lanes and unassigned changes live on the workspace page. This matches GitButler's own Agents tab, where the session sits inside its lane.
- No git: the panel is today's Changes tab, unchanged, now in the place where a session-scoped thing belongs.
- Desktop: the panel is optional and closed by default below `xl`. The workspace page is where review happens, full size, as AGENTS.md asks.
- Phone: the session's top bar shows the change chip, which opens a sheet with the session panel. The workspace name in the top bar works as a breadcrumb to the workspace page, which has a segmented control for Changes, Files, Sessions, and Terminals.

Trade-offs: each place has one owner, so position, the header, and the actions all agree, and the slots fall out of the objects. It needs a per-session record of touched paths in plain git, and two ways to see changes means two components to keep alike, which the shared change list (`ChangeList.tsx`) mostly covers already. The Files tree is no longer one click from a session, so quick open (⌘P) and file links in the transcript have to cover that.

## Why option 4

- It follows the convention people already know from Figma, Apple's inspectors, and Linear: the right side describes the selected thing. Bica stops fighting that convention instead of labeling around it.
- It answers the GitButler case without special cases: the session sees its lane, and the workspace page sees all lanes. The same grouping covers plain git and folders without git.
- It keeps one column per object, with no tabs and no second bar. Switching sessions stays a single click that changes the center and the panel together, which matters most in an app built for many sessions at once.
- It makes the workspace page the place for full-size review, which AGENTS.md already names as a goal. Review comments from there can go to the session that touched the file, since provenance is known.
- It gives extensions owner-typed slots, which hold up better than layout-named ones: `workspace.view` (Changes, Files, Commits, Terminals, or a CI view) receives a workspace, and `session.panel` receives a session. A third version control system, such as jj, provides change groups through the `vcs` service, and both places work on top of it.

Option 1's header is worth doing first anyway, since every option needs the scope named. Option 2 is the fallback if living without tabs turns out to hurt once the workspace page exists.

## A path there

1. Add the owner header to the right panel and the workspace breadcrumb to the session's top bar (option 1). Cheap, and needed in every option.
2. Turn the project page into the workspace page: its own URL, a header with branch and PR, views for Changes, Files, and Terminals, and lanes as sections for GitButler.
3. Record the paths each session's edit and write calls touch in plain git, then define "a session's group" for all three setups.
4. Turn the right panel into the session panel, and move Files and the workspace-wide Git off it.
5. Only then name the slots, after their owners.

## Open questions

- Does the session panel need Files at all, or are quick open and transcript links enough? Watch how often the tree gets opened from a session today.
- In plain git, should a session's commit be possible from its panel, committing only its files? That's convenient, but it acts on a shared branch from a session's place.
- Where does the project level show? Probably a project page listing its workspaces and PRs, like OpenCode's project home, but nothing needs it yet.
- Terminals are workspace-owned but often started by one session. The session panel would list the ones it started, and the workspace page lists all of them.
- What about a session that moves between lanes or into a new worktree (see `work-lifecycle.md`)? Its group follows it, and the panel header shows the move.
