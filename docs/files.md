# Files and diffs

Every workspace ([projects.md](./projects.md)) has a workspace page for reviewing the agent's work: one file or diff full size in the centre, with the [side panel](./layout.md)'s Files and Git ([git.md](./git.md)) tabs on the right. The same side panel sits next to every session.

The files stay on the dev machine. The browser asks the server for them and never reads the disk.

## The workspace card

With nothing open, the workspace page shows a composer for a new session here, then the workspace's sessions, then the workspace as a card: a ring with a segment per changed file, filled once staged, the pull request, the branch, and what to push or pull. Below it are the changed files with their lines added and removed, a filter, and the latest commits. A click opens a file's diff.

## Review comments (prototype)

In a diff, the + next to a line adds a comment for the agent, and dragging covers several lines. Comments collect in a bar at the bottom, and Send passes them as one prompt to the open session, or to the newest session in the workspace. A reload drops them.

## Opening a file

There are no tabs. Opening something replaces what was there, and what's open lives in the URL, so reload, back, and links all work.

- Opened from a session, the file covers the chat, and ✕ or Esc goes back.
- Keep open (the pin) makes it a kept file, listed in the sidebar until you unpin it.
- A switch jumps between a file and its diff. Diffs are side by side or unified, and always unified on a phone.
- Images, PDFs, audio, and video show as themselves, before and after side by side in a diff.
- Markdown, HTML, and Mermaid files open rendered, and the eye button shows the source. HTML runs in a sandbox with no access to Bica.
- Open in editor starts your editor on the dev machine, from `VISUAL` or `EDITOR`.
- Download saves the file through the browser, at any size, so it reaches a phone or another computer.
- Paths in replies are links that open in Bica, so they work away from the dev machine. A file opens in its workspace, over the chat when it is the session's own, and a folder opens its workspace. A file outside every workspace opens in a new tab: PDFs, images, and media as themselves, and text as plain text. ⌘ click opens it in the editor instead, and Alt click shows it in Finder.

## File lists

The Files tab shows the whole tree with git colors and a name search. Every file list, in Files and in Git, works the same way: ⌘ click and shift click select several files, and the menu acts on all of them. Changed files show as a tree or a flat list.

## Staying live

There is no file watcher. While someone looks at a workspace, the server checks git status and the file list and sends only real changes. An open diff refreshes when its file changes.

## Safety

Every request names a workspace, and paths that lead outside it are refused. Large or binary files aren't shown as text.

Downloads and files outside every workspace go over plain HTTP, at `/download/<token>/<name>`. The socket hands out each link, and its random token lasts an hour, so another website can't guess one, even through DNS rebinding. HTML and SVG are served as plain text, because they would run on Bica's own origin.
