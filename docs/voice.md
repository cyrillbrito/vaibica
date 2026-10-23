# Voice calls

A voice call lets you talk to a session. The sound-wave button next to send starts one, and on the new session page it starts an empty session with a call on it.

During the call, the composer becomes the call panel: a level meter (green while you talk, orange while the voice talks), what is being said right now, the model picker, mute, and a red end button. Each finished line moves into the transcript.

## Hold music

While the agent works in silence, Groove Salad plays: a calm internet radio station from [SomaFM](https://somafm.com), free and listener-supported. Background music in the Voice dialog sets how loud it plays on this device, for every session: from Off to Loud, all a small fraction of full volume, since the stream is mastered loud. A change applies the next time the music fades in. Turning off Sounds in Settings → Appearance silences it too, along with the chimes.

- The stream starts muted in the tap that starts the call, since iOS only lets audio start from a tap. It runs for the whole call and is only muted while someone talks, because restarting a stream takes seconds. It fades in and out, and when the call ends it fades out before it stops.
- It follows the session's status, not the page, so it keeps playing while you look at another session or page, as a sign the agent is still working.
- It plays through an `<audio>` element like the voice, so it keeps going when the phone locks. Web Audio, which the chimes use, is suspended in the background on iOS.
- It is muted rather than turned down, because iOS ignores an element's volume. On a computer it plays at the Background music level, and the fades are smooth. On iOS it plays at the phone's volume whatever the level, unless it is Off, and only goes silent at the end of the fade out.
- Bica's pages send no referrer, because SomaFM refuses streams to a page on localhost.

## How it works

```
 you ──speech──▶ GPT-Live (OpenAI) ── hand-off ──▶ Bica server ── prompt ──▶ the session
     ◀─speech──                     ◀── result ───             ◀─ reply ──
```

GPT-Live is only the voice. It listens, talks, can be interrupted, and decides when something needs the agent. The session does the work with its own model, tools, and instructions. Hand-offs arrive as ordinary prompts, queued if the session is busy ([sessions.md](./sessions.md#queue-push-stop)), so everything said and done stays in the transcript.

- The browser owns the mic and speaker over WebRTC, so audio never passes through the server. The server keeps its own line into the call for hand-offs and results.
- Progress goes to the voice as quiet commentary, and the final reply as the result to speak. Long runs never time out: the voice regularly hears "still working".
- A result that is ready while you are talking waits until you finish, or until your words stop arriving for a few seconds, so the voice doesn't answer over you. GPT-Live has no silence or turn settings: its instructions ask it to let you finish and to ignore music and background noise.
- The recent conversation goes into the voice's instructions, so "continue" makes sense.
- So do the branch and the project's file and folder names, up to a size limit. That way the voice can catch names like "CommitBox" and pass them to the agent spelled right.
- "How's it going" gets a status answer, and "stop" aborts the run.

What was said is saved in the session for the transcript, but the agent never reads it, and a call doesn't mark a session unread.

## Voice settings

Voice settings, in the context chip's menu, set how one session's calls sound: a speed, and instructions such as "talk with me in simple French". They apply from the next call. GPT-Live has no speed setting, so the speed is asked for in its instructions.

## Sign-in

Calls run on the ChatGPT plan the way the `pi-live-codex` extension does, by presenting itself as the Codex app. That route is unofficial and may break. The official route is the same protocol with an OpenAI API key, billed per minute. See [providers.md](./providers.md).

## Limits

- One call at a time per browser tab.
- On iOS, the mic stays on with the phone locked in Safari and Chrome, but not in Bica added to the home screen: iOS only lets apps that declare background audio record in the background, and Safari does but home-screen web apps don't. See [WebKit bug 226620](https://bugs.webkit.org/show_bug.cgi?id=226620).
- The mic needs a secure page: localhost or the Tailscale HTTPS address.

## Sources

- [SomaFM: how to link to us](https://somafm.com/linktous/): the official stream links.
- [How I make apps feel premium](https://youtu.be/MXLF8b15GhQ): a calorie app gives its dictation the nearby restaurant names so it hears them right. The project names follow the same idea.
