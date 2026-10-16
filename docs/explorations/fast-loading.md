# Fast loading

Ways to make opening the app and switching pages faster on the phone, through app code and drawing. None is built. Data caching is in [realtime-communication.md](../realtime-communication.md), and what's left for data in [data-sync.md](./data-sync.md).

## Where the time goes

Measured once on the dev server; rerun before relying on the numbers.

- The phone loads the unbundled dev server: about 160 files and 6 MB of JavaScript, including Solid's dev build.
- The first visit to a kind of page waits for its code too.
- Drawing a long session is the slowest step on the phone. With the CPU slowed 4x, the largest session drew in about 310 ms. `content-visibility: auto` didn't help, since the cost is JavaScript building rows.

## Steps

Each works alone. Measure on the phone after each one.

| Step | Gain | Cost |
| --- | --- | --- |
| Serve the built app to the phone | Opening: a few bundled files, Solid's production build | Every change needs a rebuild; two servers can't share the harness |
| `fileRoutes({ codeSplitting: false })` | First visit to a page | A slightly bigger first load |
| Subscribe on `pointerdown` of a session row, warm recent sessions when idle | Switching: the press comes about 100 ms before the click | Some wasted fetches |
| Draw the newest messages first, older ones on idle | Long sessions | Scroll must stay pinned to the bottom |
| Keep the last session page mounted, hidden | Switching back draws nothing | Memory, and a page cache next to the router |
| A service worker for the built app | Opening on a bad connection | Stale versions until reload; keep it away from the socket |

Virtualizing the transcript is left out: rows of different heights, streaming text, and open tool calls make it hard, and it breaks find on the page.
