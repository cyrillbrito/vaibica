# Files and diffs

Every workspace has a project page for reviewing the agent's work: one file or diff full size in the centre, with Files and Git in the right panel. The same right panel sits next to every session, for that session's workspace.

The files stay on the dev machine. The browser never reads the disk: it asks the server, and the server answers.

## The workspace card

With nothing open, the project page starts with a composer that starts a new session in this workspace, and the workspace's sessions, open ones first and archived ones muted, so coming back to a branch shows what was done on it. Below them, the workspace as a card: a ring with a segment per changed file, filled once staged, the pull request's state, the branch, and what to push or pull. Under it, every changed file with its lines added and removed and the totals, a Filter menu by kind of change, folder, and whether it is staged, and the latest commits. Pointing at a file lifts its segment of the ring. A click opens its diff.

## Comments on diff lines (prototype)

In a diff, the + next to a line number adds a comment for the agent, and dragging it covers several lines. Comments collect per workspace in the bar at the bottom, and Send passes them as one prompt, each with its file, lines and code, to the open session, or on the project page to the newest session in the workspace. They live in the tab until sent: a reload drops them.

## Opening a file

There are no tabs. Opening something replaces what was there, and what's open lives in the URL, so reload, back, and links from laptop to phone all work.

- Opened from a session, the file covers the chat. The ✕ or Esc goes back to the same draft and scroll.
- Keep open (the pin) lists a file in the sidebar under its workspace until you unpin it. Kept files are saved per device.
- A switch jumps between a file and its diff.
- Diffs are side by side or unified, and always unified on a phone.
- Images, PDFs, audio, and video show as themselves, and their diff puts before and after next to each other.
- Markdown, HTML, and Mermaid files open rendered, since agents often write them as artifacts. The eye button shows the source. HTML runs in a sandboxed frame with no access to Tau. Diffs always show the source.
- Long lines scroll with one scrollbar pinned to the bottom of the view, or wrap with the wrap button, remembered per device.
- Open in editor starts your editor on the dev machine, picked from `VISUAL` or `EDITOR`. It only helps when you sit at that machine.
- Paths in replies are links: `~/…`, `./…` and `/a/b/c` in text, and anything path-like in code, relative to the session's folder, with an optional `:line:column`. A file opens in the editor and a folder in Finder, and Alt-click shows a file in Finder. They can point outside the workspace, since agents leave reports anywhere, like terminal links in VS Code or iTerm2.

## File lists

The Files tab shows the whole tree with git colors and a name search. Every file list, in Files and in Git, is the same Pierre tree.

- Cmd or Ctrl click and Shift click select several files, and the menu then acts on all of them. A selected folder stands for every file in it.
- Changed files show as a tree or a flat list of names, per device.

## Staying live

There is no file watcher. While someone looks at a workspace, the server polls git status and the file list and sends only real changes to every open tab. An open diff re-reads itself when its file changes, and keeps the old one on screen until the new one is ready. Polling never takes git's locks, so it can't block the agent's own git commands.

## Safety

- Every request names a workspace, and the server checks that it belongs to the project.
- Paths that resolve outside the workspace are refused.
- Large or binary files aren't shown as text, very large media isn't shown at all, and huge folders without git are cut off.
