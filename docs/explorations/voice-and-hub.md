# Voice and the hub

What OpenAI's GPT-Live and ChatGPT's voice for Codex teach Bica's voice calls and the hub, minus what is built. Built: handoffs carry the user's words, steer running work, and turns the call didn't start reach the voice ([voice.md](../voice.md)), and the hub reads terminals ([hub.md](../hub.md)).

## The shape stays

OpenAI landed on the same three layers as Bica. GPT-Live is the voice and hands deeper work to a backend. For Codex, that backend gets thread tools (list, create, read, wait, message, fork, read a terminal) and the tasks do the work. Bica has GPT-Live, the hub with its session tools and board, and the sessions.

```
 you ──▶ GPT-Live ── handoff ──▶ hub ── session tools ──▶ child sessions
     ◀──          ◀── reply ────     ◀── notes, reports ──
```

The voice gives presence: full duplex, interruptions, timing. The hub gives judgment that outlives a call: the board, tickets, checking reports, the next step. A call remembers one call, so the middle layer stays.

## Not built

- Move the call. "Let me talk to the palette session" points the call's handoffs at that session and refreshes the voice's context with its recent conversation and project names; "back to the hub" points them back, as ChatGPT Voice does for Codex tasks. Medium: `startCall` binds a call to one session, and the transcript would have to follow.
- The board as quiet context. Send the board's lines to the voice at the start of a hub call, so "what waits on me" needs no hub turn. Cheap, but the board goes stale within minutes, and the hub answers fast anyway.
- Forking a child session. Codex has `fork_thread`. A new session whose ticket carries what the first one found covers most of it.
- A wait tool. Codex has `wait_threads`; notes do the same without the hub blocking.

## What not to copy

- Responses delegation, which runs the backend on OpenAI. Bica's agents run on its own harness with any provider.
- Dropping the hub on calls, with GPT-Live calling session tools itself. It has no memory between calls and no board.
- Starting work from half-heard sentences, which saves seconds on work that takes minutes.
- A filler before every handoff. GPT-Live acknowledges on its own, and the hold music says the agent works.

## Open questions

- When the call moves to a child session, should its lines go in the hub's transcript, the child session's, or both?
- Does steering by default ever join two requests that should have run apart? Codex steers too, so watch for it before adding a "do this next" marker.

## Sources

- OpenAI, [Introducing GPT-Live](https://openai.com/index/introducing-gpt-live/): full duplex, and delegation to GPT-5.5.
- OpenAI, [Delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation), [Prompting GPT-Live](https://developers.openai.com/api/docs/guides/live-prompting), and [Managing sessions](https://developers.openai.com/api/docs/guides/live-conversations): the prompt split, task state, and context limits.
- ChatGPT, [ChatGPT Voice](https://learn.chatgpt.com/docs/features/voice): moving the call to a task and back.
- openai/codex [#36404](https://github.com/openai/codex/issues/36404): the voice backend's thread tools.
- OpenClaw, [Talk realtime sessions](https://docs.openclaw.ai/nodes/talk/realtime-sessions): status, steer, cancel, follow-up, and detach versus abort.
- [gamechat](https://github.com/zdql/gamechat): one agent per slug, and rate-limited progress checks.
