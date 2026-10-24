# Faster on the phone

Ideas to make opening Bica, switching sessions, and reconnecting faster on the phone. None is built. What's built is in [realtime-communication.md](../realtime-communication.md): the browser keeps what it saw, and a reopened session skips the messages it already has.

## Where the time goes

Measured once on the dev server, so measure again before relying on it.

- The phone loads the dev server's unbundled code, with Solid's slower dev build. The first visit to each kind of page waits for its code too.
- Drawing a long session is the slowest step. The cost is building the rows, so CSS tricks like `content-visibility` don't help.
- A reconnect resends the session list, the file tree, and git status whole, even when nothing changed. Only the conversation says what the browser already has.
- The same diff is fetched again each time it opens, and pasted images travel inside the conversation. One session was 450 KB of one image.

## Ideas

Each one works alone. Measure on the phone after each.

- Serve the built app to the phone: a few bundled files and Solid's production build. The cost is a rebuild after every change.
- Load all pages' code up front, so the first visit to a page doesn't wait.
- Start loading a session when the finger touches its row, about 100 ms before the tap lands, and warm recent sessions while idle.
- Draw the newest messages first and older ones after, keeping the scroll pinned to the bottom.
- Keep the last session drawn but hidden, so switching back is instant.
- Let every topic say what the browser already has, so a reconnect sends only changes. Git's own hashes can name versions of diffs and the file tree, so a diff that didn't change is never sent twice.
- Send images by reference and keep them on the device.
- Mark data from the device's cache, such as git status, as possibly stale until fresh data arrives.

## Not taken

- Virtualizing the transcript. Rows of different heights, streaming text, and open tool calls make it hard, and it breaks find on the page.
- A database in the browser (Replicache, Zero, Electric). It's a second copy that can be wrong. T3 Chat left Dexie after races across tabs.
- CRDTs and local-first sync. The server is the only writer, and Pi Durable already owns the data.

## Sources

- Pi Pocket, a phone UI on the same Pi Durable: https://github.com/TannerMidd/pi-pocket
- Electric's offsets and refetch: https://electric-sql.com/docs/api/http
- Replicache, how it works: https://doc.replicache.dev/concepts/how-it-works
- Watchman clocks, for resuming changes: https://facebook.github.io/watchman/docs/clockspec
- Cursor on syncing a codebase with a Merkle tree: https://cursor.com/blog/secure-codebase-indexing
- Theo on T3 Chat's databases: https://rosetta.to/u/t3dotgg/i-changed-databases-again-please-learn-from-my-mistakes
