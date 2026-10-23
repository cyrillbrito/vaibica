# Voice calls

A voice call lets you talk to a session. The sound-wave button next to send starts one, and on the home page it starts a new session with a call on it.

During the call, the composer becomes the call panel: a level meter, what is being said, the model picker, mute, and a red end button. Each finished line moves into the transcript.

## How it works

```
 you ──speech──▶ GPT-Live (OpenAI) ── hand-off ──▶ Bica server ── prompt ──▶ the session
     ◀─speech──                     ◀── result ───             ◀─ reply ──
```

GPT-Live is only the voice. It listens, talks, can be interrupted, and decides when something needs the agent. The session does the work with its own model and tools. Hand-offs arrive as ordinary prompts, queued if the session is busy, so everything stays in the transcript.

- Progress reaches the voice as quiet commentary, and the final reply as the result to speak. Long runs never time out.
- A result that is ready while you talk waits until you finish.
- The voice knows the recent conversation, so "continue" makes sense, and the project's file names, so it passes names like "CommitBox" on spelled right.
- "How's it going" gets a status answer, and "stop" stops the run.

Voice settings, in the context chip's menu, set a session's speed and instructions such as "talk with me in simple French".

## Hold music

While the agent works in silence, Groove Salad from [SomaFM](https://somafm.com) plays quietly, as a sign the agent is still working. It keeps playing when you look at another page or lock the phone, and goes quiet while anyone talks. Background music in the Voice dialog sets its volume on this device, and turning off Sounds in Settings → Appearance silences it. On iOS it plays at the phone's volume.

## Sign-in

Calls run on a ChatGPT plan through the OpenAI Codex (legacy) sign-in ([models.md](./models.md#providers)), the way the `pi-live-codex` extension does. That route is unofficial and may break.

## Limits

- One call at a time per browser tab.
- The mic needs a secure page: localhost or the Tailscale HTTPS address.
- On iOS, the mic keeps working with the phone locked in Safari and Chrome, but not in Bica added to the home screen ([WebKit bug 226620](https://bugs.webkit.org/show_bug.cgi?id=226620)).

## Sources

- [SomaFM: how to link to us](https://somafm.com/linktous/): the official stream links.
- [How I make apps feel premium](https://youtu.be/MXLF8b15GhQ): a calorie app gives its dictation the nearby restaurant names so it hears them right.
