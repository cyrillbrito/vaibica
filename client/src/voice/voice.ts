import { createSignal, untrack } from 'solid-js';

import { request } from '../socket/socket';
import { soundOn } from '../ui/sound';

// Hold music: SomaFM's Groove Salad, https://somafm.com. An <audio> element
// like the voice, because iOS suspends Web Audio when the phone locks.
const MUSIC = 'https://ice.somafm.com/groovesalad-128-mp3';
// The stream is mastered loud, so even Loud is a few percent of full volume.
export const MUSIC_LEVELS = {
  off: 0,
  low: 0.005,
  medium: 0.01,
  high: 0.02,
  loud: 0.03,
};
export type MusicLevel = keyof typeof MUSIC_LEVELS;

// Per device, like the sounds: the speakers decide what is loud.
const MUSIC_KEY = 'music';
const [musicLevel, setLevel] = createSignal<MusicLevel>(
  (localStorage.getItem(MUSIC_KEY) as MusicLevel | null) || 'medium',
  { name: 'musicLevel' },
);
export { musicLevel };

export function setMusicLevel(level: MusicLevel) {
  setLevel(level);
  if (level === 'medium') localStorage.removeItem(MUSIC_KEY);
  else localStorage.setItem(MUSIC_KEY, level);
}

const musicVolume = () =>
  MUSIC_LEVELS[untrack(musicLevel)] ?? MUSIC_LEVELS.medium;

const FADE_IN_MS = 1500;
const FADE_OUT_MS = 800;

const fades = new WeakMap<HTMLAudioElement, ReturnType<typeof setInterval>>();

/**
 * Steps the element's volume to `to` over the fade, starting from wherever
 * it is, so a new fade mid-way carries on without a jump. A timer rather
 * than Web Audio, which would stop the music when the phone locks.
 */
function fade(music: HTMLAudioElement, to: number, done?: () => void) {
  clearInterval(fades.get(music));
  const from = music.volume;
  const ms = to > from ? FADE_IN_MS : FADE_OUT_MS;
  const start = performance.now();
  const timer = setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / ms);
    music.volume = from + (to - from) * t;
    if (t < 1) return;
    clearInterval(timer);
    fades.delete(music);
    done?.();
  }, 30);
  fades.set(music, timer);
}

// One voice call at a time, on one session. The browser owns the mic and the
// speaker (with echo cancellation); the server passes handoffs to the session.

type Who = 'you' | 'voice';

export type CallState = {
  sessionId: string;
  phase: 'connecting' | 'live' | 'error';
  muted: boolean;
  // Who is talking right now, if anyone.
  talking?: Who;
  // What is being said right now; once said, it is in the transcript.
  caption?: string;
  error?: string;
};

const [call, setCall] = createSignal<CallState | undefined>(undefined, {
  name: 'voiceCall',
});
export { call };

let current:
  | {
      end: () => void;
      mic?: MediaStream;
      music?: HTMLAudioElement;
      level: (who: Who) => number;
    }
  | undefined;

const update = (change: Partial<CallState>) =>
  setCall((c) => (c ? { ...c, ...change } : c));

/** How loud you or the voice are right now, 0 to 1. Read every frame. */
export const level = (who: Who) => current?.level(who) ?? 0;

/**
 * Fades the hold music in while the agent works in silence, and out again.
 * Muted once faded out, because iOS ignores an element's volume. The stream
 * keeps running either way, since restarting it takes seconds.
 */
export function holdMusic(on: boolean) {
  const music = current?.music;
  if (!music) return;
  if (!on || !musicVolume()) return fade(music, 0, () => (music.muted = true));
  if (music.muted) {
    music.volume = 0;
    music.muted = false;
  }
  fade(music, musicVolume());
}

/**
 * Starts a call. The session may still be being created: the mic and the
 * audio start in the click either way, which phones require.
 */
export async function startCall(session: string | Promise<string>) {
  current?.end();
  setCall({
    sessionId: typeof session === 'string' ? session : '',
    phase: 'connecting',
    muted: false,
  });
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  let music: HTMLAudioElement | undefined;
  if (soundOn() && musicVolume() > 0) {
    music = new Audio(MUSIC);
    music.muted = true;
    music.volume = 0;
    // Started in the tap, which iOS requires. If it fails, the call just
    // has no music.
    music.play().catch(() => {});
  }
  const meters = new AudioContext();
  const analysers: Partial<Record<Who, AnalyserNode>> = {};
  const meter = (who: Who, stream: MediaStream) => {
    const analyser = meters.createAnalyser();
    analyser.fftSize = 512;
    meters.createMediaStreamSource(stream).connect(analyser);
    analysers[who] = analyser;
  };
  const samples = new Float32Array(512);
  let callId: string | undefined;
  const self: NonNullable<typeof current> = {
    end: () => end(),
    music,
    level: (who) => {
      const analyser = analysers[who];
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      // Speech sits around 0.02–0.2 RMS; stretch that over the meter.
      return Math.min(1, Math.sqrt(sum / samples.length) * 6);
    },
  };
  current = self;
  const end = (error?: string) => {
    if (current !== self) return;
    current = undefined;
    pc.close();
    self.mic?.getTracks().forEach((t) => t.stop());
    audio.srcObject = null;
    if (music) {
      // Emptying the source stops the download, which pause alone doesn't.
      fade(music, 0, () => {
        music.pause();
        music.removeAttribute('src');
        music.load();
      });
    }
    void meters.close();
    if (callId) void request('voice.stop', { callId });
    setCall(error ? (c) => c && { ...c, phase: 'error', error } : undefined);
  };

  try {
    self.mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (current !== self) return self.mic.getTracks().forEach((t) => t.stop());
    meter('you', self.mic);
    pc.addTrack(self.mic.getAudioTracks()[0]!, self.mic);
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      audio.srcObject = stream;
      meter('voice', stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') update({ phase: 'live' });
      if (pc.connectionState === 'failed') end('Connection lost');
    };

    // The same events the server gets; here for the captions.
    const events = pc.createDataChannel('oai-events');
    // Transcripts arrive in pieces, or whole so far; either way, grow. Pieces
    // can trail the end of a turn, so a caption also clears after a pause.
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const hush = () => {
      clearTimeout(quiet);
      update({ talking: undefined, caption: undefined });
    };
    const say = (who: Who, piece: string) => {
      setCall((c) => {
        if (!c) return c;
        const so = c.talking === who ? (c.caption ?? '') : '';
        const caption = piece.startsWith(so) ? piece : so + piece;
        return { ...c, talking: who, caption };
      });
      clearTimeout(quiet);
      quiet = setTimeout(hush, 2500);
    };
    events.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === 'input_transcript.added') say('you', event.item.text);
      else if (event.type === 'output_transcript.added')
        say('voice', event.item.text);
      else if (event.type === 'turn.done') hush();
      else if (event.type === 'error') console.error('[voice]', event);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sessionId = await session;
    if (current !== self) return;
    update({ sessionId });
    const answer = await request('voice.start', {
      id: sessionId,
      sdp: offer.sdp!,
    });
    callId = answer.callId;
    if (current !== self) return void request('voice.stop', { callId });
    await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
  } catch (error) {
    end(error instanceof Error ? error.message : String(error));
  }
}

/** Hangs up, or dismisses a failed call. */
export function endCall() {
  if (current) current.end();
  else setCall(undefined);
}

export function toggleMute() {
  const muted = !call()?.muted;
  current?.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  update({ muted });
}
