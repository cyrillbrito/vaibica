# Real-time communication

All work data moves between the dev machine and the browser over one WebSocket per tab: sessions, transcripts, files, diffs, git, settings, and every command on them. HTTP only serves the app itself. The page loads empty, connects, and fills in. The socket refuses connections from other sites' pages.

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

A request asks once and gets one reply. A subscription, called a topic, gives a full snapshot, then numbered changes, for anything that changes while you look at it. The types are in `shared/src/protocol.ts`, and `socket.ts` on the server lists every call and topic.

## Where live data comes from

Pi Durable hands over a conversation once, then the exact changes from every save. Partial replies are saved several times a second, so the stream looks live.

The browser gets a slimmer copy of the conversation (`shared/src/projection.ts`). Tool calls keep their name, status, timing, and a one-line summary, and thoughts only that they exist and how long they took. Opening one asks the server for its full contents. So streamed tool output costs nothing until you open it. This follows [Pi Pocket's projection](https://github.com/TannerMidd/pi-pocket/blob/main/src/lib/projection.ts).

Everything else, such as the session list, git, and files, the server re-reads when something changes or polls while someone looks, and sends only the difference.

## Staying correct

- Each piece of live data has one source: its topic. Nothing is loaded one way and patched another.
- Changes are numbered, and a gap means subscribing again.
- Phones kill sockets in the background, so the browser reconnects, subscribes again to what's on screen, and resends unanswered requests.
- Every request has a unique id, so a command resent after a reconnect runs only once, even across a server restart.
- The browser renders from state, never from "something happened" events.
- Only what's on screen streams.

## In the browser

There is no loading UI. Each area shows the last copy the browser has, or stays blank until its data lands, and pages switch at once.

The browser keeps recent topics in memory and saves them in IndexedDB, so going back or reopening the app starts from the last copy. A cached copy is only shown, never patched: the first snapshot replaces it. A conversation tells the server which entries it already holds, so only newer ones come again.

## Logging the traffic

Creating `~/.bica/ws-log.jsonl` makes the server log every message to it, and deleting the file stops it. `bun server/scripts/ws-log.ts` sums the log by type and lists the largest messages.
