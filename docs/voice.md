# Voice calls and dictation

A voice call lets you talk to a session. The sound-wave button next to send starts one, and on the home page it starts a new session with a call on it.

During the call, the composer becomes the call panel: a level meter, what is being said, the model picker, mute, and a red end button. Each finished line moves into the transcript.

## How it works

```
 you ──speech──▶ GPT-Live (OpenAI) ── hand-off ──▶ Bica server ── prompt ──▶ the session
     ◀─speech──                     ◀── result ───             ◀─ reply ──
```

GPT-Live is only the voice. It listens, talks, can be interrupted, and decides when something needs the agent. The session does the work with its own model and tools. Hand-offs arrive as ordinary prompts, so everything stays in the transcript.

- A hand-off carries your own words: the voice is asked not to rephrase you, and Bica adds what was said in the call since the last hand-off. The transcript shows those lines once, in the call.
- A hand-off while the agent works joins that work at once, so "no, the other branch" lands before the wrong thing is done. Requests that joined the same work share one answer, spoken once.
- Progress reaches the voice as quiet commentary, and the final reply as the result to speak. Long runs never time out.
- A turn the call didn't start is spoken too, such as the hub hearing that a session finished or asks something.
- A result that is ready while you talk waits until you finish.
- The voice knows the recent conversation, so "continue" makes sense, and the project's file names, so it passes names like "CommitBox" on spelled right.
- "How's it going" gets the agent's latest step and how long ago it was, and "stop" stops the run.

Voice settings, in the context chip's menu, set a session's speed and instructions such as "talk with me in simple French".

## Hold music

While the agent works in silence, Groove Salad from [SomaFM](https://somafm.com) plays quietly, as a sign the agent is still working. It keeps playing when you look at another page or lock the phone, and goes quiet while anyone talks. Background music in the Voice dialog sets its volume on this device, and turning off Sounds in Settings → Appearance silences it. On iOS it plays at the phone's volume.

## Dictation

On a phone, the mic button in the composer records until you tap its check, then writes what you said where the cursor is. While it records, the text is locked and the toolbar shows a level meter, the time, and a cross that throws the recording away. It replaces the keyboard's own dictation, which hears names and code words badly. The recording goes to ChatGPT's transcription, the one Codex Desktop dictates with, and ChatGPT keeps it for 30 days.

## Sign-in

Calls and dictation need the OpenAI Codex (legacy) provider in Settings → Providers ([models.md](./models.md#providers)). The newer Sign in with ChatGPT under OpenAI only covers chat models, so it doesn't work for them. Both run on the plan, the way the `pi-live-codex` extension and Codex Desktop do. That route is unofficial and may break.

## Limits

- One call at a time per browser tab.
- The mic needs a secure page: localhost or the Tailscale HTTPS address.
- On iOS, the mic keeps working with the phone locked in Safari and Chrome, but not in Bica added to the home screen ([WebKit bug 226620](https://bugs.webkit.org/show_bug.cgi?id=226620)).

## Sources

- [SomaFM: how to link to us](https://somafm.com/linktous/): the official stream links.
- openai/codex [methods_v2.rs](https://github.com/openai/codex/blob/f1affbac/codex-rs/codex-api/src/endpoint/realtime_websocket/methods_v2.rs) and [#18761](https://github.com/openai/codex/pull/18761): Codex's voice passes "the user's own words", steers a running task, and sends what was said since the last hand-off.
- ChatGPT, [ChatGPT Voice](https://learn.chatgpt.com/docs/features/voice): progress, blockers, and results from Codex tasks come back while you talk.
- oh-my-pi's [live protocol](https://github.com/can1357/oh-my-pi/blob/403931b9/packages/coding-agent/src/live/protocol.ts): `session.context.append` on the same Codex route.
- [How I make apps feel premium](https://youtu.be/MXLF8b15GhQ): a calorie app gives its dictation the nearby restaurant names so it hears them right.
