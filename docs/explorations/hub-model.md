# Hub model

Which model and effort the hub should run on. The hub turns rambling dictation into prompts for other sessions, and reports status in a few lines. Most of its turns are short, so it should feel fast without getting the user's intent wrong.

## Recommendation

Run the hub on Claude Sonnet 5.5 at `low` effort, through the direct Anthropic sign-in rather than the CLI proxy.

- At `low`, Sonnet 5.5 skips thinking on simple turns. A status question came back in about 3 seconds, with the first words in under 2. A full worker prompt took about 8 seconds, with the first words at about 5.
- In two dictation tests it kept every instruction, dropped the user's self-corrections, and said plainly what it didn't know. Haiku 5.5 and GPT-6 Luna, run without thinking, were two to four times faster, but they made up facts on easy turns.
- The proxy added 3 to 4 seconds to every Claude and GPT request in these tests, even a one-word reply. That is more than the gap between any two of these models. The hub's speed depends on the route as much as the model.

The fallback is GPT-6.1 Sol at `low` through the ChatGPT sign-in. It is a different provider, so it still works when the Claude limits run out. Its prompts were the tersest and among the most accurate, its first words came after about 2 seconds, and it costs about half as much per turn. It streams slowly, though, at roughly 30 tokens a second, so a long prompt takes 10 seconds or more.

If Sonnet's prompts start to feel thin, Opus 5.5 at `low` was just as fast on prompt-writing turns, wrote shorter prompts, and was the most careful about what it didn't know. It thinks before every reply, though, so simple turns are about a second slower, and it costs twice as much.

## Candidates

The two speed columns come from the test below: a direct sign-in, a hub-style system prompt of about 52k tokens on Claude (34k on OpenAI's tokenizer) read from the cache, and the median of three cached runs. "Status" is a one-line question about the board. "Prompt" is the rambling bug report turned into a worker prompt. The AA columns are Artificial Analysis's numbers at the same effort.

| Model, effort | AA index | AA end-to-end, 500 tokens | Status: first words / done | Prompt: first words / done | Cost per cached turn | Quality in the test |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Sonnet 5.5, `low` | 36 | 5.5 s | 1.9 s / 2.9 s | 5.1 s / 8.4 s | ~$0.014 | Faithful, kept the corrections, admitted what it didn't know |
| Claude Opus 5.5, `low` | 42 | 18.6 s | 3.0 s / 3.0 s | 4.3 s / 7.5 s | ~$0.023 | Best, the most careful about unknowns |
| GPT-6.1 Sol, `low` | 42 | 12.7 s | 2.1 s / 3.7 s | 2.1 s / 9.7 s | ~$0.006 | Tight and accurate, the shortest prompts |
| Claude Haiku 5.5, thinking off | 29 (at `low`) | 12.2 s (at `low`) | 1.6 s / 2.3 s | 0.9 s / 2.1 s | ~$0.0007 | Made up details and claimed things it hadn't checked |
| Gemini 3.8 Flash, `low` (proxy) | 33 | not measured | not run | 2.6 s / 5.7 s | ~$0.004 | Padded the prompt with invented code paths |
| GPT-6 Luna, reasoning off | 18 | 5.4 s | not run | 1.2 s / 2.1 s | ~$0.0004 | Very thin prompts, and once wrote a prompt addressed to itself |

The cost assumes list prices, a cache hit on the whole prompt, and the output tokens actually measured, thinking included. On a plan sign-in the cost comes out of plan limits instead, in the same proportions. A cold turn also writes the cache, which costs about $0.13 on Sonnet, $0.26 on Opus, and under a cent on Haiku, for 52k tokens with the 5-minute cache. OpenAI and Gemini don't charge for cache writes. Hub turns are often minutes apart, so on Claude the write can cost more than the turn itself, and Bica's long-cache setting (1 hour) is worth turning on for the hub.

## What the test did

The test ran on 2026-10-14. It used pi-ai the way Bica calls it, with each model's effort setting and a cached prompt. There were three tasks:

- A rambling, self-correcting bug report, dictated style, which the hub turns into a worker prompt with its constraints: a new worktree, don't touch the voice work, check the phone viewport, don't commit.
- A message covering three threads on a small board. It has a mid-sentence change of mind ("make it quieter… no, make it a setting"), a review approval with one fix and then a commit, a title the worker may change, and "is anything else running?"
- "hey whats waiting on me right now".

What stood out:

- On the board message, Sonnet, Opus, and Sol all said the board might not list everything and offered to check. Haiku without thinking said "Nothing else is on the board" as if it had checked. On the status question it reported "four other threads in progress" when there was one. Haiku at `low` invented a "per device" setting rule.
- GPT-6 Luna without reasoning wrote one-paragraph prompts that lost the user's nuance, and once added a "Hub" section telling itself to run `list`.
- Gemini 3.8 Flash at `low` added route names and field names that don't exist in Bica. Its lowest level is `low`, since `minimal` returns an error on this model.
- Through the proxy, a one-word reply took about 5 seconds on Claude and GPT models, and about 1.6 seconds on Gemini. Direct, it took 1 to 2 seconds. Haiku without thinking also once ran on to the 4,000-token cap through the proxy, which it never did direct.
- Claude's tokenizer counted the same text as about 1.5 times as many tokens as OpenAI's, which raises Claude's real cost per turn.

Treat these as a sanity check, not a benchmark: one machine, one day, two to four runs per cell, and quality judged by reading the answers rather than by a blind grader.

## What the published data says

- Artificial Analysis measures speed with a 10k-token prompt and models a 500-token answer, including thinking. Sonnet 5.5 at `low` has the lowest latency in Anthropic's lineup there (0.57 s to the first answer token, 5.5 s end to end), because it often skips thinking. Haiku 5.5 at `low` still thinks first (9.2 s to the first answer), and so does Opus 5.5 at `low` (12.4 s). AA has no non-thinking Haiku 5.5 entry, so the "off" row above leans on this test alone.
- Anthropic's prompting guide says the same: at `low`, Sonnet 5.5 "skips thinking on most simple requests", while from `medium` up it thinks before almost every reply. Haiku 5.5 can turn thinking off entirely at `low`, `medium`, or `high`. Sonnet 5.5's floor is `between_tools`, which pi-ai doesn't expose, so `low` is the lowest effort Bica can pick for it.
- An independent test of Claude Code subagents (Ovidius, 458 graded runs) moved mechanical work to Haiku 5.5 at `low`, but kept "judgment prose", such as specs, client emails, and fact checks, on Sonnet 5.5. Haiku 5.5 at `low` lost points mainly on the build spec, which is the hub's main job.
- A replay of real builder briefs (Jean Brito) found Opus 5.5 at `low` beat Sonnet 5.5 on quality and speed for coding work, and that raising Sonnet's effort didn't close the gap. That fits the Opus note above, but it measured coding agents, not prompt writing.
- OpenAI dropped `none` and `minimal` on GPT-6.1 Sol, so `low` is its floor. An independent test (seedrouter) found the first text at `low` after 3 s and answers streaming at about 25 tokens a second, close to what this test saw.
- LMArena only ranks these models at high effort: Opus 5.5 high 1504, Gemini 3.8 Flash high 1495, GPT-6.1 Sol max 1483, Sonnet 5.5 xhigh 1471. That says little about `low`. No IFBench scores for the 5.5 or 6.x models turned up.
- OpenRouter shows Sonnet 5.5 at a median of about 1 to 3 s latency and about 110 tokens a second across its hosts, over all effort levels mixed.

The benchmarks agree with the test on one point: below a certain size, speed comes from skipping thinking, and skipping thinking is where small models start to make things up. Sonnet 5.5 at `low` gets most of that speed while still thinking when a turn needs it.

## Notes for building it

- The hub should use the direct `anthropic` sign-in even when other sessions use the proxy. The proxy's account pooling buys nothing for one small session, and its overhead lands on every turn.
- Changing effort mid-conversation invalidates Claude's cache unless it goes through the per-message effort change. Keep the hub at one effort.
- pi-ai lists Sonnet 5.5's cache read at $0.20 per million tokens, but Anthropic charges $0.10, so Bica's spend display overstates the hub's cost by about a third.

## Sources

- Artificial Analysis, [Claude Sonnet 5.5 release page](https://artificialanalysis.ai/models/releases/claude-sonnet-5-5), [Claude Opus 5.5](https://artificialanalysis.ai/models/releases/claude-opus-5-5), [Claude Haiku 5.5](https://artificialanalysis.ai/models/releases/claude-haiku-5-5), [GPT-6.1 Sol](https://artificialanalysis.ai/models/releases/gpt-6-1-sol), [GPT-6 Luna](https://artificialanalysis.ai/models/releases/gpt-6-luna), [Gemini 3.8 Flash](https://artificialanalysis.ai/models/releases/gemini-3-8-flash), read 2026-10-14. Comparisons: [Sonnet low vs Opus low](https://artificialanalysis.ai/models/comparisons/claude-sonnet-5-5-low-vs-claude-opus-5-5-low), [Haiku low vs Sonnet low](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-low-vs-claude-sonnet-5-5-low), [GPT-6.1 Sol low vs Sonnet low](https://artificialanalysis.ai/models/comparisons/gpt-6-1-sol-low-vs-claude-sonnet-5-5-low), [Haiku low vs Luna non-reasoning](https://artificialanalysis.ai/models/comparisons/gpt-6-luna-non-reasoning-vs-claude-haiku-5-5-low).
- Artificial Analysis, [performance methodology](https://artificialanalysis.ai/methodology/performance-benchmarking): 10k-token prompts, eight tests a day, end-to-end time modeled for 500 answer tokens plus average thinking.
- Anthropic, [Prompting Claude Sonnet 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5) and [Prompting Claude Haiku 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5): what each effort level does, and when thinking can be turned off. [Pricing](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-10-14.
- Ovidius, [Claude Code subagents: Haiku vs Sonnet vs Opus benchmarked](https://www.ovidius.ai/blog/claude-code-subagents-haiku-vs-sonnet-vs-opus-benchmarked), 2026-10-09.
- Jean Brito, [Benchmark subagent models the way you run them](https://jeanfbrito.github.io/posts/benchmark-subagents-the-way-you-run-them/), 2026-10-10.
- Seedrouter, [GPT-6.1 Sol reasoning effort: low vs medium vs high vs max](https://seedrouter.ai/blog/gpt-6-1-sol-reasoning-effort), 2026-10-05.
- Google, [Gemini 3.8 Flash model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash): `minimal` thinking is not supported.
- LMArena, [text leaderboard](https://arena.ai/leaderboard/text/overall), snapshot of 2026-10-02.
- OpenRouter, [Claude Sonnet 5.5](https://openrouter.ai/anthropic/claude-sonnet-5.5): per-host latency and throughput, one-week median.
- This repo's own test, 2026-10-14, as described above. The scripts aren't kept.
