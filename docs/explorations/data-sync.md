# The data layer

What kinds of data Bica moves between the server and the browser, and the ways a data layer can be built around them. The goal is a design that sends only what the browser lacks, keeps what it has seen, and grows topic by topic. [fast-loading.md](./fast-loading.md) covers app code and drawing; this doc is about the data.

## What's built and what's left

[realtime-communication.md](../realtime-communication.md) describes what's built: a slim projection of the conversation, ops after the first snapshot for every topic, topics kept in memory after a view leaves, a copy saved in IndexedDB, and a conversation that skips the entries the browser already holds.

What's left:

- Only the conversation can say what the browser already has. Every other topic sends its whole value on each subscribe, so a reconnect resends the session list, the file tree, and git status even when nothing changed.
- Diffs and file contents are keyed by path, so the same diff is fetched again every time.
- The conversation projection still sends pasted images inline as base64. One session was 450 KB of one image.
- A copy derived from disk, such as git status, is shown from the device cache like any other topic, with nothing to say it may be stale.

Bica's data is not one thing. There are about seven kinds, and each needs its own rule for "what do you already have, and what's missing".

## Seven kinds of data

Every piece of data in Bica falls into one of these kinds. The kind decides how to resume, whether the browser may keep it, and how to tell if a kept copy is current. Adding a new topic later means picking its kind, and the rules come with it.

### 1. Logs: append-only, with ids

The transcript's entries. Pi Durable never rewrites an entry: a context edit is a new entry, and a fork is a new conversation. Only a compaction changes the view, by moving the head marker so older entries drop out of the active list.

- Version: the first and last entry ids the browser holds. Built this way for the conversation.
- Resume: "I have entries 3 to 50". The server sends entries after 50, or everything if the head moved.
- Store in the browser: yes, and safely, since an entry never changes. A stored entry can only be missing, never wrong.
- Others: Durable Streams' offsets, Electric's shape log, Linear's `lastSyncId`, Kafka.

The terminal's output is a log too: a string with a `start` offset, where old text is cut from the front. Resuming is "send from offset N".

### 2. Hot state: small, changes many times a second

`pi.live` (the streamed answer and running tools), and `pi.inbox` (the queue). They change every 100 ms during a run and mean nothing once it ends.

- Version: none needed. They're small, so the whole value is cheap.
- Resume: always send it whole, then ops.
- Store in the browser: no. A stored "running" state is a lie after a minute. Showing nothing until it arrives is better than showing it wrong.

### 3. Documents: small, change rarely

`pi.agent`, `pi.usage`, projects, settings, accounts, models, plan usage. Each is one JSON value that changes now and then.

- Version: a content hash, or a revision number. Pi Durable keeps revisions for documents.
- Resume: "I have hash X". The server answers "unchanged" or sends it whole.
- Store in the browser: yes, shown at once and checked in the background (stale while revalidate). A wrong value for a moment does little harm.
- Others: HTTP ETags, Replicache's cookie, TanStack Query's `staleTime`.

### 4. Collections: many records with ids

The session list, terminals list, and the file tree (paths are ids). The whole collection is big, but a change touches one record.

- Version: per record, such as `updatedAt`, or a hash of the whole.
- Resume: send changed and removed records only. Without a per-record version, a hash says "unchanged" and anything else gets the whole list.
- Changes: by record, not whole. Built with Chord's `diffRevisions`: one status change on the real session list is 63 bytes of ops instead of 52 KB. A session moving to the top is 343 bytes, or 78 if the list were keyed by id instead of an array.
- Store in the browser: yes.
- Others: Linear's object pool, TanStack DB collections, Zero's rows.

### 5. Derived from disk: true only now

Git status, GitButler status, a session's changed files. They're computed from files that change behind Bica's back, from an editor or a shell.

- Version: no natural one. A hash of the value tells whether the browser's copy matches.
- Resume: send the hash, the server answers "unchanged" or with the value. The server must still read git to know.
- Store in the browser: as a hint only. Show it greyed or quietly, and replace it within a second. Never act on it, for example never commit based on a stored status.

### 6. Content by hash: never changes

A file's content at a git blob id, a diff between two blob ids, an image in a prompt. If the key is the content's hash, the value can never change.

- Version: the hash is the version.
- Resume: nothing to resume. Either the browser has it or it asks.
- Store in the browser: yes, forever, until space runs out. This is the safest cache there is.
- Others: git itself, HTTP `immutable` caching, content-addressed stores. Pi Pocket loads images by URL for the same reason.

Keyed by the blob ids on both sides instead of by path, a diff would be fetched once.

### 7. Ephemeral: presence and moments

Typing indicators, a voice call's state, "someone else is viewing". Pi Pocket lists these explicitly as state that lives in the process alone.

- Store anywhere: no. They're sent live and forgotten.

## What Pi Pocket does

Pi Pocket is a web app on the same Pi Durable, by another author. Its source is public, it's the closest reference for Bica, and Bica's conversation projection follows its own. It does no caching across sessions at all: switching sends the room's full view again. What it does instead:

- A server-side projection (`projection.ts`). Browsers never see Pi Durable records. Each entry becomes a small display shape: a user message is its text and an image count, and an assistant message is its blocks. Tool arguments are clipped at 1,500 characters and tool output at 8,000, with the middle cut out, and the browser asks for the full entry when you expand it. Images load by URL. Thinking signatures and system prompts never leave the server.
- Per-connection memory of what was sent. Each tab's connection remembers which entry ids it already got, so updates carry only new entries, plus the list of ids in order when it changed.
- Slow fields only when they change. Side documents (pins, chat, subagents, schedules) are compared as JSON per tab and left out of an update when unchanged. The browser keeps the last value for any field that's missing.
- Batching per kind of data: a room's changes at most every 90 ms, peek tiles every second, the session list every 400 ms.
- Peek tiles: other sessions as small live summaries of their last few steps. Only tiles on screen are live, and the tab tells the server which after scrolling settles for 250 ms. The rest keep their last lines.
- A file list kept for a few seconds and shared by all tabs, compressed once, and versioned so a browser with the newest one hears only that.
- Drawing only the last 60 rows of a transcript, with "Show earlier messages" adding 60 more. The data is all there; only the drawing is limited.
- A list in its docs of what lives only in memory and is lost on restart: who's connected or typing, approvals waiting, browser pages, and when runs ended.
- Its own data (chat, pins, notes, schedules) stored as Pi Durable documents, changed in the same commit as the transcript, so a crash never leaves them out of step.

Not in Bica, and worth a look: peek tiles, batching per kind of data, images by URL, and drawing only the last rows.

## Ways to build a data layer

Six families, from how the systems above work inside. Each is a complete way of thinking, and real systems mix them.

### Server-driven views

The server knows what each client shows and pushes a projection of it. The client is a thin renderer. Phoenix LiveView, Hotwire, and Pi Pocket work like this, and Bica's topics are already close.

- Where data lives: on the server. The client has only what's on screen.
- Duplicates: the server remembers what each connection got (Pi Pocket's `sentEntries`), or numbers changes (Bica's `n`).
- Good for: one server that owns the truth, which is Bica. Small client, simple rules.
- Weak at: anything after a disconnect or a page switch, since the memory belongs to the connection.

### Query cache

The client caches request results by key, shows them at once, and refetches when stale or when the server pokes. TanStack Query, SWR, Apollo, and Convex's client work this way.

- Where data lives: client memory, optionally saved to IndexedDB with a `buster` (the build hash) and `maxAge`.
- Duplicates: one in-flight request per key. Unused results stay for `gcTime` (5 minutes by default), then go.
- Good for: documents and content by hash. The lifecycle (`staleTime`, `gcTime`, `buster`, `maxAge`) is the right vocabulary for Bica's client side.
- Weak at: live changes and big values, since a refetch sends everything. Convex resends a whole query result on each change, which is why T3 Chat sent the whole thread on every token until they split streaming out.

### Sync engine with a client replica

The client keeps a local database of records and a cursor. It asks for changes since the cursor, and the UI reads only from the local database. Linear, Replicache, Zero, ElectricSQL with TanStack DB, and PowerSync work this way.

- Where data lives: IndexedDB or SQLite in the browser, plus an in-memory pool. Linear bootstraps from IndexedDB, then pulls changes since `lastSyncId`. Heavy models load lazily.
- Duplicates: records have ids, and every change has a sequence number, so applying one twice does nothing and a gap is noticed.
- Escape hatch: a "drop and refetch" signal, Electric's `must-refetch`, for anything the cursor can't express.
- Good for: logs and collections. Any session seen before opens instantly, even offline.
- Weak at: it's a second copy that can be wrong, it needs schema versions and eviction, and IndexedDB is awkward. T3 Chat moved off Dexie after races and corruption across tabs.

### Durable streams

Every entity is an append-only stream with offsets, readable over plain HTTP from any offset, then tailed live. Durable Streams, Electric Agents, Kafka, and S2 work this way. Electric's Durable Sessions put token chunks, messages, presence, and agent state into one stream and materialize them in the browser.

- Where data lives: the server keeps the log, and the client keeps the offset and what it built from it.
- Duplicates: offsets, plus producer ids and sequence numbers that the server deduplicates.
- Good for: transcripts and terminal output, which are already logs. Offsets are the cleanest resume rule there is.
- Weak at: state that isn't a log (git status, a file tree). Turning those into logs means inventing events, and Bica's rule is to render from state, not events.

### CRDTs

Each peer holds a full copy and can change it, and merges always agree. Yjs, Automerge, and Loro work this way. Yjs syncs by exchanging state vectors, the latest clock seen from each peer, and sending only what the other side lacks.

- Where data lives: every peer, with IndexedDB providers in the browser.
- Good for: many writers editing the same thing, such as collaborative text.
- For Bica: the server is the only writer of everything except your drafts. The state vector idea is worth knowing, since it's a cursor generalized to many writers. A CRDT would only matter for editing files together with an agent, which is far away.

### Local-first databases

The app's state is an event log or a SQLite database in the browser, synced to a server. LiveStore and Jazz work this way.

- For Bica: they want to own the data model, and Pi Durable already does. Loading a WASM database also costs about half a second on a phone before anything shows.

## Can git and the file tree resume like a log?

Yes, in two ways that work together. Git status and the file tree have no history of their own, but the server can give them one, and git already stores most of them as content that never changes.

### Give every topic a clock

The server already polls git status every 1.5 s and the file list every 4 s, and compares the result with the last one. Each time something differs, it can number that change and keep the ops (from `diffRevisions`) in a short ring, say the last 200 changes per topic. The browser keeps the number it last applied. On resubscribe it says "I'm at 41", and the server sends the ops from 42 on, or the whole value if 41 has already left the ring.

The number needs the server's start time in it, because the ring lives in memory and a restart empties it. Watchman's clocks look like `c:<start>:<tick>` for exactly this reason. A clock from another start means "fresh instance", and the client gets everything. Electric's shape `handle` does the same job.

- Pros: it works for every topic built on `live()` at once, with no knowledge of git or files. State becomes a log of its own changes, so everything resumes the same way as the transcript.
- Cons: it only helps while the server keeps running and the gap is short. A phone that comes back the next morning gets everything, which for git status is a few KB anyway.
- Others: Watchman's clock and `since` queries, `@parcel/watcher`'s `getEventsSince` (it saves a snapshot to disk, so it even survives restarts), git's own fsmonitor token, and Replicache's "client view record", where the server keeps each client's last versions and diffs against them.

A file watcher fits under this later, in place of polling. The watcher's events say which paths changed, so the server re-reads only those and appends the ops. Git's built-in `fsmonitor--daemon` does this for `git status`, so status stops scanning the whole folder.

### Use git's own hashes

Git is a content-addressed store. Every file version is a blob with a hash, and every folder at a commit is a tree whose hash covers everything inside it. A tree with the same hash is the same folder, forever.

- `git status --porcelain=v2` already prints the blob hashes in HEAD and in the index for each changed file. Only the working copy has no hash, and `git hash-object` gives one for just the changed files.
- A diff between two blob hashes never changes. Keyed that way, a diff the browser has seen is never fetched again, even across days.
- The file tree at HEAD is a tree of trees. The browser can keep trees by hash and ask for only the folders it opens, like `git ls-tree <tree>`. After a commit, only the folders on the changed paths have new hashes, so only those are fetched. The live part of the tree is just status on top: files added, deleted, or untracked.

This is how Cursor keeps its index of a codebase in sync: a Merkle tree of file and folder hashes, compared from the root down, sending only the branches that differ. Git's `have` and `want` negotiation in fetch is the same idea between two repositories.

- Pros: the browser's copy can never be wrong, only missing, the same guarantee the transcript has. It survives restarts and days away, and suits IndexedDB perfectly.
- Cons: the file tree is not only HEAD. It's HEAD plus status, which is more work than one list. Folders without git need their own hashing.

### Reconcile a stale copy

When the browser has an old copy and no usable clock, for example after a server restart, it can send a hash of what it has. Equal means done. For large sets there is research on sending less than everything: range-based set reconciliation sorts the items, compares hashes of ranges, and splits only the ranges that differ, a few rounds for a small difference in a huge set. It's how Nostr relays and some databases sync. For Bica, one round with a hash per top-level folder would get most of the gain, and even that is only worth it for repositories much larger than this one.

### What fits Bica

| Data | Resume by | Survives a restart |
| --- | --- | --- |
| Git status | Clock and ring | No, but it's small |
| File tree | Git tree hashes, plus status | Yes |
| Diffs and file contents | Blob hashes | Yes |
| Session list, projects, other `live()` topics | Clock and ring | No |
| Terminal output | Offset | No, the shell's output lives in memory |

The clock and ring is the general tool, and git's hashes are the special one for anything git already stores.

## A layered design for Bica

The families above suggest four layers, each with one job. Each piece of data keeps one source, and the design grows by adding topics, not mechanisms.

```
 Sources        Pi Durable · JSON files · git and disk · PTYs · memory
    │
 Projection     per topic: the display shape the browser needs, nothing more
    │
 Topic protocol subscribe with "have" → unchanged | since | whole, then ops
    │
 Client store   memory with keep-alive · IndexedDB for kinds that allow it
    │
 Views          read the store, draw only what's on screen
```

### Projection

The conversation has one (see [realtime-communication.md](../realtime-communication.md)). The rest of the idea: images and diffs by hash instead of inline, and other topics projected too when their raw shape carries more than the browser draws. The projection is also the contract, so a Pi Durable update changes one file.

### Topic protocol

One rule for every topic, with the kind deciding what "have" means:

- On subscribe, the browser says what it has: nothing, a hash, or a cursor. The conversation's held entries are the first cursor.
- The server answers "unchanged", "since" (only what's missing), or the whole value.
- A "start over" answer covers anything the cursor can't express, such as a compaction or a terminal's cut scrollback.

### Client store

Saved copies follow their kind: logs, collections, documents, and content by hash are kept, hot state and ephemeral data never are, and data derived from disk is kept only as a hint, shown quietly until it's confirmed.

### Views

Views read from the store and draw what's on screen, like Pi Pocket's last 60 rows. This keeps drawing cost flat on long sessions, separate from how much data is held.

## What this means for each topic

| Topic | Kind | Version | Kept in the browser |
| --- | --- | --- | --- |
| Conversation entries | Log | First and last entry id (built) | Yes (built) |
| `pi.live`, `pi.inbox` | Hot state | None | No |
| `pi.usage`, `pi.agent` (projected) | Document | Hash | Yes |
| Session list | Collection | Record `updatedAt` | Yes |
| Projects, settings, accounts, models, plan usage | Document | Hash | Yes |
| Terminals list | Collection | Hash | Yes |
| Terminal output | Log | Offset | Memory only |
| File tree | Collection | Git tree hashes, plus status | Yes |
| Git status, GitButler, session changes | Derived from disk | Clock | As a hint |
| Diffs, file contents, images | Content by hash | Blob id | Yes, long |
| Voice, presence | Ephemeral | None | No |

## An order that keeps each step useful

Each step stands alone and each makes the next one cheaper.

1. Add "have" to subscribe for the other topics: a hash for documents and collections, a clock and ring for the `live()` topics. Reconnects and revisits send only what's missing.
2. Key diffs and images by hash, keep them on the device, and send images by reference.
3. Mark copies derived from disk as hints until their snapshot lands.
4. Give the file tree git's tree hashes, so a big repo's tree is fetched once.

## Sources

- Pi Pocket site and explainers: https://tannermidd.github.io/pi-pocket/, https://tannermidd.github.io/pi-pocket/durable.html, https://tannermidd.github.io/pi-pocket/architecture.html
- Pi Pocket source, especially `src/server/projection.ts`, `src/server/room.ts`, `src/server/files.ts`, `web/store.js`, `web/peeks.js`, and `docs/architecture.md`: https://github.com/TannerMidd/pi-pocket
- Pi Durable README, "Watching a Conversation": `node_modules/@earendil-works/pi-durable/README.md`
- Chord's `diffRevisions` and wire encoder: `node_modules/@earendil-works/chord/dist/delta/`
- Electric: https://electric.ax/, Agents: https://electric.ax/agents/, Streams: https://electric.ax/streams/
- Durable Streams protocol: https://github.com/durable-streams/durable-streams
- Durable Sessions: https://electric-sql.com/blog/2026/01/12/durable-sessions-for-collaborative-ai
- Electric HTTP API (offsets, `up-to-date`, `must-refetch`): https://electric-sql.com/docs/api/http
- TanStack Query caching and persister: https://tanstack.com/query/latest/docs/framework/react/guides/caching, https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient
- TanStack DB: https://tanstack.com/db/latest/docs/overview
- Replicache, how it works: https://doc.replicache.dev/concepts/how-it-works
- Zero: https://zero.rocicorp.dev/docs/introduction
- Linear's sync engine, reverse-engineered: https://github.com/wzhudev/reverse-linear-sync-engine
- OpenCode web sync: https://github.com/anomalyco/opencode/blob/51e310c9/packages/app/src/context/sync.tsx
- How Convex works: https://stack.convex.dev/how-convex-works
- Theo on T3 Chat's databases: https://rosetta.to/u/t3dotgg/i-changed-databases-again-please-learn-from-my-mistakes
- Yjs document updates: https://docs.yjs.dev/api/document-updates
- Automerge Repo: https://automerge.org/docs/reference/repositories/
- LiveStore: https://docs.livestore.dev/, Jazz: https://jazz.tools/docs
- Browser storage compared (RxDB): https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html
- Watchman clocks and `since` queries: https://facebook.github.io/watchman/docs/clockspec
- `@parcel/watcher` and `getEventsSince`: https://github.com/parcel-bundler/watcher
- Git's built-in file system monitor: https://git-scm.com/docs/git-fsmonitor--daemon
- Replicache row versions and client view records: https://doc.replicache.dev/strategies/row-version
- Cursor on syncing a codebase with a Merkle tree: https://cursor.com/blog/secure-codebase-indexing
- Git fetch negotiation (`have`, `want`): https://git-scm.com/docs/protocol-v2
- Range-based set reconciliation: https://logperiodic.com/rbsr.html
