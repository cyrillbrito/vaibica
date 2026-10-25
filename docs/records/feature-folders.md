# Feature folders without joins

October 2026. Decision: inside the client and the server, code sits in feature folders, but the pieces every feature touches stay one file each: the protocol, the socket's table of calls, the sidebar, and ⌘K. Features import each other freely, and the only rule checked is that the client and `shared` have no import cycles.

## What was planned

The source-layout exploration went further than folders. Each feature would own a slice of `shared/src` with its calls and topics, joined in `protocol.ts` by `interface Calls extends SessionCalls, TerminalCalls, …`. Its `handlers.ts` would be spread into the socket router, and it would export its sidebar rows and its ⌘K actions for the frame to join. Layers would import downward only: sessions at the bottom, and hub, voice, and context usage on top, never imported by sessions.

## What we found

The first draft moved every file into a folder and was checked against the plan.

- The joins were seams with one user each. The socket's table is about 190 lines of one-line handlers, and its type already fails when a call is missing. Twelve `handlers.ts` files would each wrap a wrapper. Both ends of the socket read `protocol.ts` as a whole, so slicing it added imports without making anything easier to find.
- The layering didn't hold, and forcing it would hurt. The composer imports dictation and the call button from voice, and voice reads sessions. The composer is the deep UI that resisted plug-in slots in the [extensibility attempt](./extensibility.md), and an import ban would bring those slots back.
- Placing files by their first user made the real problems. Git's requests sat in `files/`, the side panel that hosts the Git tab sat in `files/` too, and five folders held a single file each.
- Barrels caused the server's cycles. Half the server folders had an `index.ts`, deep imports went around them, and almost every import cycle went through one.

## The decision

- A feature gets a folder on a side once it has two files there; a single file joins the feature it builds on.
- Files go to the feature that owns them, not the one that uses them first.
- No `index.ts` barrels. Imports name the file they need.
- No layering rule between features. Lint fails on import cycles in the client and `shared` instead. The server keeps one loop on purpose: session tools start sessions, and sessions need the tools.
- The protocol, the socket's table, the sidebar, and ⌘K stay whole. A piece moves into its feature only when it owns state there, as terminal and kept-file rows did.

Reopen the joins if one of those files becomes hard to work in for reasons other than length.

## Sources

- [opencode](https://github.com/anomalyco/opencode): feature folders directly under `packages/app/src`, with components, stores, and helpers mixed in each.
- [T3 Code](https://github.com/pingdotgg/t3code): `apps/web/src/components` keeps most components flat and gives a folder only to bigger features.
- Matt Pocock's [codebase-design](https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design) skill: one adapter means a hypothetical seam.
