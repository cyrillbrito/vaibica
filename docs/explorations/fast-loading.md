# Fast loading

Ways to make opening the app and moving between pages feel faster, through app code and drawing, with the pros, cons, effort, and complexity of each. None of it is built. Keeping data around between pages is built, see the Caching section of [realtime-communication.md](../realtime-communication.md), and what's left for data is in [data-sync.md](./data-sync.md). The goal stays the same as everywhere in Tau: no spinners, because the data should already be there or arrive before anyone looks for it.

## Where the time goes

Measured on the dev server, on localhost, in a 390 × 844 viewport:

- Opening the app loads about 160 files and 6 MB of JavaScript (1.8 MB gzipped), because the phone uses the unbundled dev server. That includes Solid's dev build and its diagnostics.
- Parsing a conversation and drawing its messages takes 9–44 ms on the desktop, and grows with the session.
- The first visit to a kind of page (session, project, terminal) also waits for that page's code, about 27 more files.

On the phone, drawing is several times slower, and each Tailscale round trip comes on top. So the order of cost there is roughly: app code on first open, then drawing, then the round trip, and last the size of the data.

A benchmark with the CPU slowed 4x drew the largest session in about 870 ms with Solid's Chrome performance tracks on, and 310 ms with them off, so they are off in `vite.config.ts`. `content-visibility: auto` on rows changed nothing, because the remaining cost is JavaScript building the rows, not layout or paint.

## Techniques

Effort is a rough size of the work: small is under an hour, medium is a day or so, large is several days. Complexity is how much it adds to what you have to keep in your head afterwards.

### Serve the built app to the phone

The phone would use `bun run build` and `bun run start` behind Tailscale instead of the dev server.

- Pros: the biggest win for opening the app. It means a few bundled files instead of about 160, Solid's production build, no diagnostics, and minified, cacheable code.
- Cons: every change needs a rebuild before the phone sees it, so it doesn't suit testing the work in progress on the phone. Both servers can't own the same harness file at once.
- Effort: small. Complexity: low, though it adds a second way of running.

### Load all page code up front

`fileRoutes({ codeSplitting: false })` puts every page in the first load. The alternative is to start loading a page's code on `touchstart` or hover.

- Pros: the first visit to each kind of page no longer waits for its code.
- Cons: the first load gets slightly bigger. With the dev server this is minor next to everything else it sends.
- Effort: small. Complexity: none.

### Prefetch on intent

The browser would subscribe when you press a session row (`touchstart` or `pointerdown`), not when the page mounts. It could also warm the most recent few sessions while the phone is idle.

- Pros: on a phone, the press comes about 100 ms before the click fires, which covers most of a round trip. Warming recent sessions makes the common case instant.
- Cons: some fetches are wasted. Warming many sessions costs socket traffic and memory.
- Effort: small. Complexity: low.

### Draw less at once

Drawing is the slowest step on long sessions. Two ways to cut it remain:

- Draw the newest messages first and the older ones in the next frame or on idle.
- Virtualize the list, so only visible rows exist in the page.

- Pros: this goes straight at the biggest cost on the phone.
- Cons: drawing in two passes can make the scroll position jump unless the view sticks to the bottom, which it does. Virtualization is hard with rows of different heights, streaming text, and open tool calls, and it breaks finding text on the page.
- Effort: medium for two passes, large for virtualization. Complexity: medium to high.

### Keep the last page mounted

The previous session's page would stay rendered but hidden, so switching back only toggles visibility.

- Pros: switching back is truly instant, with no drawing at all, and the scroll position and open tool calls are kept.
- Cons: more memory and more live updates running in the background. It doesn't fit Solid's router directly, so it needs a small cache of mounted pages next to it.
- Effort: medium. Complexity: medium.

### Cache the app with a service worker

A service worker would store the built app's files, so opening the installed app doesn't touch the network for code.

- Pros: it makes opening fast and reliable on a bad connection, and it pairs naturally with the topics saved on the device. It's part of a proper installed app anyway.
- Cons: only useful with the built app. Cache updates are a known trap, where an old version keeps running until the next reload. Its scope must be kept away from the socket.
- Effort: medium. Complexity: medium.

## Off-the-shelf options

- TanStack Query keeps fetched data around and refreshes it in the background. Tau's topic layer already does the hard part, which is live changes, and keeps topics alive itself.
- Plain HTTP requests instead of the socket would gain browser caching and ETags. But snapshots and their changes would then come down two channels, and stitching them is where data gets duplicated or lost. The socket stays.

## Suggested order

| Step | Gain | Effort | Complexity |
| --- | --- | --- | --- |
| Built app on the phone | Opening | Small | Low |
| All page code up front | First visit to a page | Small | None |
| Prefetch on press | Switching | Small | Low |
| Newest messages first | Drawing long sessions | Medium | Medium |
| Service worker | Opening on a bad connection | Medium | Medium |

Each step works on its own, so it's fine to stop anywhere. Measure on the phone after each one, since the desktop numbers hide where the phone is slow.
