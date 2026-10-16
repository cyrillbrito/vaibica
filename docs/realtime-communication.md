# Real-time communication

All work data moves between the dev machine and the browser over one WebSocket per tab: sessions, transcripts, files, diffs, git, settings, and every command on them. HTTP only serves the app itself. The page renders an empty shell, connects, and fills in.

This is a personal tool, so there is no SEO and no server rendering of data. The socket refuses connections from other sites' pages.

## Two kinds of traffic

```
Browser (one socket per tab)                  Server (dev machine)
────────────────────────────                  ────────────────────
  request   (id, call, args)       ──▶        commands and one-off reads
  reply     (id, value | error)    ◀──

  subscribe   (sub, topic, params) ──▶        live state: session list,
  unsubscribe (sub)                ──▶        a conversation, git status,
  snapshot    (sub, n, value)      ◀──        files, settings, terminals
  changes     (sub, n, ops)        ◀──
```

A request asks once and gets one reply. A subscription gives a full snapshot, then numbered changes, for anything that changes while you look at it. The wire types are in `src/lib/protocol.ts`.

## Where live data comes from

Pi Durable hands over a whole conversation once, then the exact changes from every save. Partial answers are saved several times a second, so the stream looks live, and a listener that falls behind gets a fresh snapshot.

The browser doesn't get the conversation as Pi Durable stores it, but a slimmer copy (`src/lib/projection.ts`), sent as the difference from the last one:

- A tool call keeps its name, status, timing, and its short arguments cut to one line, such as the summary, path, or command. Its full input and output stay on the server.
- A thought keeps only that it exists and how long it took. Signatures and the system prompt never leave the server.
- Opening a tool call or a thought asks for its contents with `session.detail`. An open call asks again when its status changes.
- The context breakdown needs everything, so the server works it out and sends it with the conversation.

Streamed tool output and thinking therefore cost nothing until you open them. This follows [Pi Pocket's projection](https://github.com/TannerMidd/pi-pocket/blob/main/src/lib/projection.ts).

Everything else, such as the session list, git, and files, the server re-reads when a save touches it or polls while someone looks, and only when it changed. After the first snapshot it sends the difference from the last value, so one session changing status costs a few dozen bytes, not the whole list. To the browser both look the same.

## Staying correct

The risk with a pipe is duplicated or missing data. These rules rule it out:

- Each piece of live data has one source: its subscription. Nothing is loaded one way and patched another.
- Changes are numbered, and a gap means dropping the copy and subscribing again.
- Phones kill sockets in the background, so the browser reconnects, subscribes again to what's on screen, and resends unanswered requests.
- Every request has a unique id, so a command resent after a reconnect gets the first run's answer instead of running twice. Prompts pass that id on to Pi Durable, which remembers it across restarts.
- The browser renders from state, never from "something happened" events, since one missed event would leave it wrong.
- Only what's on screen streams. A view subscribes when it appears and unsubscribes when it goes away.
- A cached copy is only shown, never patched. The first snapshot replaces it, and only then do changes apply.

## In the browser

One small module owns the socket. Views ask for a topic and read a reactive value, and changes keep unchanged parts intact, so only what changed re-renders.

There is no loading UI. Each area shows the last copy the browser has, or stays blank until its data lands, and moving to another page switches at once. The session page shows its title, top bar, and composer straight away from the session list, and the messages appear in place when the conversation arrives.

## Caching

The browser keeps what it has shown, so going back to a page or reopening the app starts from the last copy instead of a blank area.

- A topic no view uses any more is unsubscribed but keeps its value in memory, for the most recent dozen or so. Going back shows it at once and subscribes again.
- Topics are also saved in IndexedDB on this device, when a view leaves them and when the page hides, up to a fixed number of copies. Terminal output isn't saved. A version number in `src/lib/topic-cache.ts` drops old copies when a value changes shape.
- A conversation tells the server which entries it holds. Saved entries never change, and the active ones run in id order, so if the first and last ids still match, the snapshot leaves those entries out and sends only newer ones and the documents. A compaction changes the first entry, and the whole view comes again.

So a cached copy can be out of date for the moment until its snapshot lands, for example a session that looks idle but is running.

## Hosting the socket

Bica uses Solid's Vite plugin directly, not SolidStart, and the plugin has no WebSocket hook. In development, a small Vite plugin answers socket upgrades on Vite's server. In production, the start script attaches the same handler to the app's server. Either way it runs in the one process that owns the harness.

## Logging the traffic

Creating `~/.bica/ws-log.jsonl` makes the server append every message, in and out, as one JSON line with its time, connection, and size. Deleting the file stops it, with no restart. `bun scripts/ws-log.ts` sums the log by message type and topic, by changed path, and lists the largest messages.
