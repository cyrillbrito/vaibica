# Voice talking over the user

The report: during a call, the voice sometimes starts talking while the user is still speaking. This traces the whole turn-taking path, says which parts are ours, and what was changed.

## Short answer

GPT-Live has no turn detection settings to get wrong. It decides on its own when to speak, and the only steering we have is its instructions and when we hand it context. Two things on our side made it talk over the user:

1. The agent's result went to the voice the moment the run ended, even while the user was mid-sentence. A result is the voice's cue to speak, so it spoke. Now the result waits until the user's turn is over.
2. The instructions pushed it to act fast ("promptly create a client delegation") and had none of the turn-taking rules OpenAI's prompting guide says to keep: an interruption policy, a backchannel policy, and the "keep listening while the user pauses, ignore music and background noise" control. Now they do.

A third likely cause is the hold music reaching the mic, mostly on iPhone. That one is the other session's area and a product decision, see below.

## 1. Provider and session configuration

- Provider: GPT-Live (`gpt-live-1-codex`), OpenAI's full-duplex voice model, reached the way the Codex Desktop app does (`chatgpt.com/backend-api/codex/realtime/calls`, "quicksilver" protocol). Audio flows browser ↔ OpenAI over WebRTC. The server holds a "sideband" WebSocket to `api.openai.com/v1/live/{call}` for events and results. See `src/server/voice.ts`.
- Session config sent at start: `model`, `instructions`, `audio.output.voice`, `delegation: { type: 'client' }`. Nothing else.
- There is no VAD, `turn_detection`, `silence_duration_ms`, threshold, prefix padding, eagerness, `create_response` or `interrupt_response` in this API. OpenAI's migration guide: "Stream audio continuously. GPT-Live decides when to speak; remove manual audio commits and voice-turn triggers." Jambonz, who integrated it: "There is no `response.create` to solicit a turn, no `response.cancel` to interrupt one, and no `turn_detection` to tune." Session fields are fixed to model, instructions, input, audio, store and delegation.
- So nothing is "left at a default" that causes early cutoffs. The knob OpenAI offers instead is the prompt: their recommended template keeps "Backchannel policy", "Interruption policy" and "Delegation policy" headings, plus an optional "Silence and background noise" control for "if testing shows the assistant reacts to pauses or unrelated sounds". Our prompt had none of these, and told it to delegate "promptly". GPT-Live can delegate mid-utterance: pi-live-codex, which we ported, has a 1.5 s grace to stitch user transcript that keeps arriving after a delegation, so delegations do fire before the user is done.

## 2. Barge-in

- There is no speech-started event, no `response.cancel` and no truncate in this protocol. The events are `session.started`, `output_audio.delta`, `input_transcript.added`, `output_transcript.added`, `turn.done`, `delegation.created` and `error`. GPT-Live hears the user while it speaks and stops itself.
- Over WebRTC the audio buffer on our side is only the jitter buffer, tens of milliseconds, so there is nothing queued to clear. The browser has no handler to add here, and none is missing. OpenAI's server-controls guide only asks for client playback control when the app must block audio the model already chose to say.
- Barge-in therefore depends on the mic signal reaching GPT-Live clean, which is section 4.

## 3. Our own triggers

What we send into the call, all from `src/server/voice.ts`:

| Trigger | Channel | When | Can it make the voice speak? |
| --- | --- | --- | --- |
| Agent's final reply (`"Agent Final Message"`) | speakable (no channel = speakable on this wire, per Codex's source) | when the run settles | Yes, by design. **Was sent with no regard for the user talking.** |
| Status reply (`[[live:status]]`) | speakable | right after the delegation | Yes. Delegation can come mid-utterance. |
| Cancel reply (`[[live:cancel-current]]`) | speakable | right after the abort | Yes, same. |
| Error reply | speakable | when the hand-off throws | Yes, same. |
| Step text between tool calls | commentary | each `toolUse` entry | Meant to be silent. Codex sends the same thing as "QuietReasoningStatus" on commentary. |
| "Still working (N s so far)" | commentary | every 20 s | Meant to be silent. |

Not found: no response per transcript chunk, no retries, no "agent finished" notification spoken separately, no second sender. The browser's data channel only draws captions; only the server answers delegations. `startCall` in the browser ends any previous call first.

The race: the user asks something, the voice delegates, the agent works for a while, and the user starts talking again (a follow-up, or thinking out loud). When the run ends, the result lands in the middle of that and the voice reads it out over them. That is the clearest match for "a response comes back and the voice starts talking over me".

Not proven, left alone: we don't dedupe `delegation.created` by id. pi-live-codex does. A duplicate would run the request twice and speak twice, but I found no evidence the sideband repeats it.

## 4. Audio side

- Mic: `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`. Plain values are "ideal" constraints, and these are the browser defaults anyway, so they apply. I could not check `track.getSettings()` on a real device here.
- The voice itself plays from the peer connection's track through an `<audio>` element. Browser echo cancellation always covers peer-connection audio, so the voice hearing itself is unlikely.
- The hold music is different. `echoCancellation: true` only promises to cancel peer-connection audio. Chrome cancels other page audio only with the new `echoCancellation: 'all'` value (Chrome 141+) on platforms that support it. So the SomaFM stream is probably not removed from the mic on desktop Chrome. On a computer it plays at the Background music level, 0.5% to 3%, so it is quiet. On iPhone, though, `volume` is ignored, so the music plays at full phone volume through the speaker, right next to the mic. Whether iOS's voice processing removes it is not something I could verify.
- When the music plays: `HoldMusic` in `CallBar.tsx` turns it on while the agent works and nobody `talking`. `talking` comes from captions, so it flips only after the first transcript piece arrives, and clears 2.5 s after the last piece or on `turn.done`. That means the music keeps playing for the first second or so after the user starts talking (until the transcript arrives, plus the 0.8 s fade), and fades back in when the user pauses for 2.5 s mid-thought. Music in the mic can make GPT-Live hear a "turn" that isn't the user's, or mishear where the user's turn ends.

## 5. Configurable?

GPT-Live has no silence duration or eagerness setting. What exists:

- Per-session voice instructions (context chip → Voice settings) already reach the voice, and win where they conflict. "Wait until I've clearly finished before you answer" can go there today.
- The server's 3 s "user went quiet" fallback in the new gate.
- The Background music level in the Voice dialog, which can be Off.

## What was fixed

All in `src/server/voice.ts`, away from the music code.

1. **Results wait for the user to finish.** Every `"Agent Final Message"` (result, status, cancel, error) now goes through `finish()`, which waits while the user has an open turn: transcript pieces have arrived and their `turn.done` hasn't. It gives up waiting once no new piece has arrived for 3 s, in case GPT-Live never closes the turn, and stops waiting if the call ends. Why it's right: the result is the one thing we push that is meant to be spoken, and we already track the user's turn for the transcript. It is exactly what OpenAI's guide hints at ("If your application must control when the user hears audio, add playback controls"), done at the source instead of in playback. Limit: transcripts lag speech by a moment, so a result that lands in the first half-second of the user speaking still gets through. The prompt line below covers that.
2. **Turn-taking instructions.** Added the guide's backchannel and interruption policies, the "keep listening while the user pauses to think; don't treat a cough, music, or nearby conversation as a new request" control, "if the user is talking when a result arrives, let them finish first", and changed "promptly create a client delegation" to "once the user has finished the request". Why it's right: these are OpenAI's documented controls for this exact symptom, and this API has no others. "Use few backchannels" is a small call of mine; the guide's default is "moderate". Since a backchannel counts as talking over someone to this user, fewer seemed right.

Types, lint and the Bun checks pass. Nothing here was tried on a real call.

## Decisions for the user

1. **Hold music while the user talks** (other session's code, so not changed here). Options:
   - (My pick) Mute the music from the mic's own level, not from captions: the call already measures `level('you')` every frame, so music could drop the moment the mic is loud, and stay off for a few seconds after. Fast and local, small change to `HoldMusic` in `CallBar.tsx`.
   - Keep the caption trigger but stretch the 2.5 s pause before the music returns.
   - Turn the music off on iPhone, where its volume can't be lowered.
2. **`echoCancellation: 'all'`** on the mic. On browsers that support it, it also removes the hold music from the mic, and older browsers read it as `true`. Worth trying, but it changes the mic path on every call, so check `mic.getAudioTracks()[0].getCapabilities().echoCancellation` in your browser first: it lists `"all"` if supported.
3. **How long a result waits.** 3 s of transcript silence is my pick: long enough for a breath, short enough that a result never feels lost. Longer is calmer but slower. I would not make it a setting; the per-session voice instructions already cover "be more patient".
4. **Dedupe `delegation.created` ids**, as pi-live-codex does. Two lines; only worth it if you ever hear an answer twice.

## What to check by ear

1. Ask for something that takes the agent a minute, then start talking about something else before it ends. The voice should not start until you finish, and should give the result right after.
2. Pause for two seconds mid-sentence while asking something. The voice should wait.
3. On the phone speaker with hold music playing, start talking while the agent works. Listen for whether the voice reacts to the music, and whether the music drops quickly.
4. Talk over the voice while it answers. It should stop within a moment. If it doesn't, the mic signal is the problem, not turn-taking.
5. If it still answers too early, add "wait until I have clearly finished before you answer" to the session's voice instructions and compare.

## Sources

- [Prompting GPT-Live](https://developers.openai.com/api/docs/guides/live-prompting): template with backchannel, interruption and delegation policies; the "Silence and background noise" control.
- [Managing GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations): the only session fields; context appends and their timing.
- [Delegation and tools in GPT-Live](https://developers.openai.com/api/docs/guides/live-delegation): results can be spoken whenever they arrive; "add playback controls" if timing matters.
- [Migrate to GPT-Live](https://developers.openai.com/api/docs/guides/live-migration): no manual turn triggers.
- [Server-side controls](https://developers.openai.com/api/docs/guides/voice-server-controls): client playback control is only for blocking audio.
- [jambonz on GPT-Live](https://jambonz.org/blog/openai-gpt-live-support-in-jambonz): no `response.create`, `response.cancel` or `turn_detection`.
- [openai/codex `realtime_conversation.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/realtime_conversation.rs): an omitted channel is speakable; quiet status goes on commentary.
- [pi-live-codex 0.1.9](https://www.npmjs.com/package/pi-live-codex): the extension Bica ported; its 1.5 s continuation grace and delegation dedupe.
- [MDN: echoCancellation](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/echoCancellation) and [Chrome 141 `all`/`remote-only`](https://chromestatus.com/feature/5585747985563648): `true` only guarantees cancelling peer-connection audio.
