# Context usage

Bica shows what fills a session's context window, what it cost, and whether the prompt cache is warm, and nudges you to compact before a session gets slow and forgetful.

## What you see

A chip in the session's top bar shows how full the window is. While idle, it counts down the prompt cache's last minutes and shows a snowflake once it has expired. It turns yellow, then red, as the window fills or the session passes a size where models get slower, pricier, and more forgetful, whichever comes first.

One line above the composer speaks up only when there is something worth doing, and × hides it until things change:

- The cache has expired on a session over 30k: the line offers Clean up with what it frees, since the next message resends everything anyway. Compact shows next to it only when the session would stay over 200k even after Clean up, because compacting a cold session rereads all of it at full price first.
- The cache is warm and the session is over 200k: the line offers Compact. In the cache's last 10 minutes it says so, since that is the cheapest moment to compact. × hides it until the next 100k.
- A smaller session nears the point where Pi Durable compacts on its own: the line says when, so you can pick the moment instead.
- Nothing above the composer repeats the transcript: progress and results show as lines in the transcript, and a sound plays when a compaction or clean up you watch lands.

The chip's menu offers compact, clean up, turning [assistant mode](./assistant-mode.md) off, voice settings, and the details. When Clean up can't run, the menu says why under it: a compaction is in progress, or there is no long output older than the last few steps, the only part it touches. Forking lives on each reply. [Assistant mode](./assistant-mode.md) compacts and cleans up on its own.

The details open on the window as a field of cells, filled in order by the system prompt, tools, the conversation, and tool output, with the room kept for the answer outlined at the end. Pointing at a row or its cells lights them and rolls the big number to that part, and a row opens to its parts. The conversation row has Compact and the tool output row has Clean up. Pointing at Clean up lights the cells it would clear, the cells breathe while either runs, and a check and a "freed" line follow. Below are the biggest prompts, replies, and tool results (tap one to jump to it), the cache hit rate, and the spend per model, by cost or by tokens.

## Where the numbers come from

The server computes everything from the full conversation and sends the result with it, since the browser only gets a slim copy ([realtime-communication.md](./realtime-communication.md)).

- The total is measured: the newest answer reports its request size. The parts are rough counts, scaled to add up to that total, which covers what we can't see, such as the real tokenizer.
- Spend comes from Pi Durable's usage tracking, per model from [providers.md](./providers.md), at API prices even on a subscription.
- Before the first answer or right after a compaction, nothing is measured yet, and the details say "estimated".

## The prompt cache

Rereading a cached prompt costs about a tenth of sending it fresh. Anthropic keeps a cache for 5 minutes by default, or for 1 hour if the request asks, at a higher price for writing it. Bica asks for 1 hour by default, like Claude Code on a subscription, and Settings → Models switches back. Replaying past sessions showed 1 hour cost about 15% less, since every gap longer than the cache rewrites the whole context at full price.

The countdown shows only for models whose cache lifetime pi-ai's catalog knows, which means Anthropic's.

## Compaction and clean up

Compaction summarizes older turns. Pi Durable does it on its own when the window is nearly full, and Compact does it on demand, where you can say what to keep. The transcript marks it, and the marker opens to the summary the agent continues from.

Clean up clears old tool output from what the model reads, with no chat model call. Long tool results and images become a short note, while prompts, replies, and thinking stay. The newest six messages stay whole, as in fast-jev-compaction, since a follow-up usually refers to the answer and its last steps. Older steps clear even inside one long turn. A long output keeps its first and last lines under the note, since nothing tested picks the lines the agent needs later better than that. Old sessions lose about three quarters of their size this way, since tool output is most of it. The transcript still shows everything, with a "Cleaned up old output" line where it happened. While it runs, a line in the transcript says so, and the chip's menu shows "Cleaning up…", so a second click does nothing. It can run while the agent works: the edits land at the agent's next step, like a steer, and the line waits until then. It is best on a cold cache: a compaction then rereads the whole session at full price before it can shrink it, while Clean up costs nothing.

With a decision model picked in Settings, such as Jev through OpenRouter, or Haiku standing in for one ([providers.md](./providers.md)), Clean up first asks it which old outputs the work still needs word for word, and those stay. It reads the session with each output cut to its start, one yes or no question per output. Without one, or when it fails, everything clears as before. The size Bica shows Clean up would free counts every output, so with a decision model it may free a little less. The judge is `src/server/sessions/cleanup-judge.ts`.

## Sources

- affectUI's [Context Window](https://www.affectui.com/components/context-window) for the field of cells and compacting in place, and [Compact Breakdown](https://www.affectui.com/components/compact-breakdown) for the spend per model.
- Pi's context extensions ([`pi-context-usage`](https://pi.dev/packages/pi-context-usage), `@that-yolanda/pi-context`, `pi-context-breakup`) for the breakdown method.
- Claude Code's `/context` for categories and cost per tool, and OpenCode's `/context` for marking estimates clearly.
- [fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction) and its Pi port [pi-fast-jev-compaction](https://github.com/KamilPostrozny/pi-fast-jev-compaction) for asking Jev per tool call whether its output must stay. Bica asks one question instead of two, since it never drops a call, and shows Jev the start of each output, which the port notes the original doesn't.
- [tool-output-pruning-lab](https://github.com/Dymyt-ry/tool-output-pruning-lab): on about 1,000 real tool calls, no selector kept the lines the agent used later better than keeping the start and end of each output. Hence the start and end under every note, and a reason to treat Jev's picks as a bonus, not a proof.
- Claude Code's [prompt caching docs](https://code.claude.com/docs/en/prompt-caching): compacting after the cache expired rereads the whole history uncached.
