# Context usage

Bica shows what fills a session's context window, what it cost, and whether the prompt cache is warm, and nudges you to shrink a session before it gets slow and forgetful.

## What you see

A chip in the session's top bar shows how full the window is. While idle, it counts down the prompt cache's last minutes, and shows a snowflake once the cache has expired. It turns yellow, then red, as the window fills or the session grows past the size where models get slower, pricier, and more forgetful.

A line above the composer speaks up only when there is something worth doing, and × hides it until things change:

- The cache has expired on a big session: it offers Clean up, since the next message resends everything anyway. Compact shows too when Clean up alone wouldn't be enough.
- The cache is warm and the session is very big: it offers Compact, and says so when the cache is about to expire, the cheapest moment to compact.
- Pi Durable is about to compact on its own: it says when, so you can pick the moment instead.

Progress and results show as lines in the transcript, with a sound when they land.

The chip's menu offers Compact, Clean up, turning [assistant mode](./assistant-mode.md) off, voice settings, and the details. The details show the window as a field of cells, filled by the system prompt, tools, the conversation, and tool output. Pointing at a part lights its cells. Below are the biggest prompts, replies, and tool results, the cache hit rate, and the spend per model.

## Where the numbers come from

- The total is what the newest answer reported. The parts are rough counts, scaled to add up to it.
- Spend comes from Pi Durable's usage tracking, at API prices even on a subscription.
- Before the first answer or right after a compaction, nothing is measured yet, and the details say "estimated".

## The prompt cache

Rereading a cached prompt costs about a tenth of sending it fresh. Anthropic keeps a cache for 5 minutes, or for 1 hour if asked, at a higher price for writing it. Bica asks for 1 hour, like Claude Code on a subscription, and Settings → Models switches back. Replaying past sessions showed 1 hour cost about 15% less. The countdown only shows for models whose cache lifetime is known, which means Anthropic's.

## Compaction and clean up

Compaction summarizes older turns. Pi Durable does it on its own when the window is nearly full, and Compact does it on demand, where you can say what to keep. The transcript marks it, and the marker opens to the summary.

Clean up clears old tool output from what the model reads, with no model call. Long tool results and images become a short note that keeps their first and last lines, while prompts, replies, thinking, and the latest steps stay whole. Old sessions lose about three quarters of their size this way. The transcript still shows everything. Clean up can run while the agent works, and is best on a cold cache, where compacting would first reread the whole session at full price.

With a [decision model](./models.md#which-model-does-what) set, Clean up first asks it which old outputs the work still needs, and keeps those.

Both lines in the transcript have a fork button, which starts a new session from the context as it is after them.

## Sources

- affectUI's [Context Window](https://www.affectui.com/components/context-window) and [Compact Breakdown](https://www.affectui.com/components/compact-breakdown) for the field of cells and the spend per model.
- Pi's context extensions ([`pi-context-usage`](https://pi.dev/packages/pi-context-usage), `@that-yolanda/pi-context`, `pi-context-breakup`) for the breakdown method.
- Claude Code's `/context` for the categories, and OpenCode's `/context` for marking estimates.
- [fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction) and [pi-fast-jev-compaction](https://github.com/KamilPostrozny/pi-fast-jev-compaction) for asking a decision model which outputs must stay.
- [tool-output-pruning-lab](https://github.com/Dymyt-ry/tool-output-pruning-lab): on about 1,000 real tool calls, nothing beat keeping the start and end of each output.
- Claude Code's [prompt caching docs](https://code.claude.com/docs/en/prompt-caching): compacting after the cache expired rereads the whole history uncached.
