# Context usage

Tau shows what fills a session's context window, what it cost, and whether the prompt cache is warm, and nudges you to compact before a session gets slow and forgetful.

## What you see

A chip in the session's top bar shows how full the window is. While idle, it counts down the prompt cache's last minutes and shows a snowflake once it has expired. It turns yellow, then red, as the window fills or the session passes a size where models get slower, pricier, and more forgetful, whichever comes first.

- Past that size, a nag above the composer pushes you to compact, getting ruder with every 100k. Later hides it until the next 100k.
- When the cache has expired on a big session, a line above the composer offers Clean up instead, with what it would save.
- A compaction or clean up you watch land shows how much it dropped, with a cheer.

The chip's menu offers fork from here, compact, clean up, a switch to another [profile](./profiles.md), and the details.

The details open on the window as a field of 240 cells, filled in order by the system prompt, tools, the conversation, and tool output, with the room kept for the answer outlined at the end. Pointing at a row or its cells lights them and rolls the big number to that part, and a row opens to its parts. The conversation row has Compact and the tool output row has Clean up. Pointing at Clean up lights the cells it would clear, the cells breathe while either runs, and a check and a "freed" line follow. Below are the biggest prompts, replies, and tool results (tap one to jump to it), the cache hit rate, and the spend per model, by cost or by tokens.

## Where the numbers come from

The server computes everything from the full conversation and sends the result with it, since the browser only gets a slim copy ([realtime-communication.md](./realtime-communication.md)).

- The total is measured: the newest answer reports its request size. The parts are rough counts, scaled to add up to that total, which covers what we can't see, such as the real tokenizer.
- Spend comes from Pi Durable's usage tracking, at API prices even on a subscription.
- Before the first answer or right after a compaction, nothing is measured yet, and the details say "estimated".

## The prompt cache

Rereading a cached prompt costs about a tenth of sending it fresh. Anthropic keeps a cache for 5 minutes by default, or for 1 hour if the request asks, at a higher price for writing it. Tau asks for 1 hour by default, like Claude Code on a subscription, and Settings → Behavior switches back. Replaying past sessions showed 1 hour cost about 15% less, since every gap longer than the cache rewrites the whole context at full price.

The countdown shows only for models whose cache lifetime pi-ai's catalog knows, which means Anthropic's.

## Compaction and clean up

Compaction summarizes older turns. Pi Durable does it on its own when the window is nearly full, and Compact does it on demand, where you can say what to keep. The transcript marks it, and the marker opens to the summary the agent continues from.

Clean up clears old tool output from what the model reads, with no model call. Long tool results and images in earlier turns become a short note, while prompts, replies, and thinking stay. Old sessions lose about three quarters of their size this way, since tool output is most of it. The transcript still shows everything. It is best on a cold cache, since the next message rewrites the whole context anyway.

## Sources

- affectUI's [Context Window](https://www.affectui.com/components/context-window) for the field of cells and compacting in place, and [Compact Breakdown](https://www.affectui.com/components/compact-breakdown) for the spend per model.
- Pi's context extensions ([`pi-context-usage`](https://pi.dev/packages/pi-context-usage), `@that-yolanda/pi-context`, `pi-context-breakup`) for the breakdown method.
- Claude Code's `/context` for categories and cost per tool, and OpenCode's `/context` for marking estimates clearly.
