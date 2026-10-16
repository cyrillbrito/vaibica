# The data layer

What is left to make the socket send only what the browser lacks. [realtime-communication.md](../realtime-communication.md) describes what is built: the conversation's projection, changes after the first snapshot, topics kept in memory and in IndexedDB, and a conversation that skips the entries the browser holds.

## What's left

- Only the conversation says what the browser already has. Every other topic resends its whole value on subscribe, so a reconnect resends the session list, the file tree, and git status even when nothing changed.
- Diffs and file contents are keyed by path, so the same diff is fetched again every time.
- The projection sends pasted images inline as base64. One session was 450 KB of one image.
- A cached copy of git status shows like any other topic, with nothing to say it may be stale.

## Kinds of data

Each kind has its own rule for what the browser holds and how to resume it.

| Kind | Topics | Resume by | Kept on the device |
| --- | --- | --- | --- |
| Log, append-only with ids | Conversation entries, terminal output | First and last id, or an offset | Yes; terminals in memory only |
| Hot state | `pi.live`, `pi.inbox` | Send it whole | No: a saved "running" is wrong a minute later |
| Document | Usage, agent, projects, settings, accounts, models | A hash: "unchanged" or the whole value | Yes |
| Collection | Session list, terminals, file tree | A hash, or per-record versions | Yes |
| Derived from disk | Git status | A clock (below) | As a hint only, never acted on |
| Content by hash | Diffs, file contents, images | The hash is the version | Yes, long |
| Ephemeral | Voice, presence | Nothing | No |

## Resuming git and the file tree

Two ways that work together:

- A clock per topic. The server already compares each poll with the last value. It can number each change and keep the recent ops in a ring. On resubscribe the browser says "I'm at 41" and gets the ops after it, or the whole value if 41 left the ring. The clock carries the server's start time, so a restart means "start over", like Watchman's `c:<start>:<tick>`. This works for every `live()` topic at once.
- Git's own hashes. `git status --porcelain=v2` prints blob hashes, and a diff between two blob hashes never changes. The tree at HEAD is a tree of hashed folders, so after a commit only the folders on changed paths are new. Cursor syncs its code index with the same Merkle idea.

A file watcher fits under the clock later: its events say which paths to re-read.

## Order

Each step is useful alone.

1. Add "have" to subscribe for every topic: a hash for documents and collections, a clock for `live()` topics.
2. Key diffs and images by hash, keep them on the device, and send images by reference.
3. Show copies derived from disk as hints until their snapshot lands.
4. Give the file tree git's tree hashes.

## Not taken

- A client database (Linear, Replicache, Zero, Electric with TanStack DB): a second copy that can be wrong, with schema versions and eviction. T3 Chat left Dexie after races across tabs.
- Durable streams for everything: git status and the file tree aren't logs, and Bica renders from state, not events.
- CRDTs and local-first databases: the server is the only writer, and Pi Durable already owns the data model.

## Sources

- Pi Pocket, the closest reference on the same Pi Durable: https://github.com/TannerMidd/pi-pocket, especially `src/server/projection.ts` and `docs/architecture.md`. Worth a look: live peek tiles of other sessions, batching per kind of data, images by URL, drawing only the last rows.
- Electric's HTTP API (offsets, `must-refetch`): https://electric-sql.com/docs/api/http
- Durable Streams: https://github.com/durable-streams/durable-streams
- Replicache, how it works and client view records: https://doc.replicache.dev/concepts/how-it-works, https://doc.replicache.dev/strategies/row-version
- Linear's sync engine, reverse-engineered: https://github.com/wzhudev/reverse-linear-sync-engine
- Theo on T3 Chat's databases: https://rosetta.to/u/t3dotgg/i-changed-databases-again-please-learn-from-my-mistakes
- Watchman clocks: https://facebook.github.io/watchman/docs/clockspec, and `@parcel/watcher`'s `getEventsSince`: https://github.com/parcel-bundler/watcher
- Git's fsmonitor: https://git-scm.com/docs/git-fsmonitor--daemon
- Cursor on syncing a codebase with a Merkle tree: https://cursor.com/blog/secure-codebase-indexing
