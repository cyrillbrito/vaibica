import 'server-only';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { promisify } from 'node:util';
import WebSocket from 'ws';

import type { VoiceLine } from '#lib/transcript';
import { models } from '#server/providers';
import { voiceSession } from '#server/sessions';

/*
 * Voice calls on a session, on the ChatGPT subscription. A port of the
 * pi-live-codex extension (MIT): GPT-Live talks with the user in the browser
 * over WebRTC and hands work to the session ("client delegation"); this
 * server answers each hand-off with the session's reply.
 *
 * Unofficial: it signs in the way the Codex Desktop app does. The official
 * route is the same protocol on api.openai.com with an API key.
 */

const SIGNALING_URL =
  'https://chatgpt.com/backend-api/codex/realtime/calls?intent=quicksilver&architecture=avas';
const CLIENT_VERSION = '0.144.1';
const MODEL = 'gpt-live-1-codex';
const VOICE = 'sol';
// Context appends are capped; pi-live-codex keeps them to 500 bytes.
const CHUNK_BYTES = 500;
const STATUS = '[[live:status]]';
const CANCEL = '[[live:cancel-current]]';
// How long without a new piece of the user's transcript counts as them having
// stopped, when GPT-Live never closes their turn.
const USER_QUIET_MS = 3000;

const INSTRUCTIONS = `You are the voice of a coding assistant. The user talks to you about one ongoing session with a coding agent.

Answer briefly and conversationally, without markdown. Don't greet or speak just because the call connected; wait for the user.

Backchannel policy: Use few backchannels, and never start an answer while the user is still talking.

Interruption policy: Stop speaking when the user interrupts. Listen to what they say. Keep listening while the user pauses to think, and let them finish before you answer. Don't treat a cough, music, or nearby conversation as a new request.

The agent has the project, its notes and code, and the tools. For anything that needs them (reading, searching, coding, running commands, checking), create a client delegation once the user has finished the request, with the complete request and the context it needs. Never do that work yourself or answer it from memory. A new request while work is running gets its own delegation; they run in order.

The agent's work often takes several minutes. It never times out: keep waiting for its "Agent Final Message", and never tell the user it timed out, failed or stalled unless that message says so. Progress notes may arrive meanwhile; mention them only if asked.

When the user only asks how the current work is going, create a delegation whose entire text is exactly ${STATUS}. When they clearly ask to stop the current work, create a delegation whose entire text is exactly ${CANCEL}.

Treat delegation results as your own work. Never mention a backend, delegation, or another assistant. Commentary is silent progress, for continuity only. Context starting with "Agent Final Message": is the finished result: tell the user what matters in it, in a few spoken sentences. If the user is talking when it arrives, let them finish first. Never claim something is done before its result arrives.

The recent conversation below is background, so "continue" or "that" can refer to it. Don't summarize it, answer it, or act on it until the user speaks.`;

async function route() {
  const token = (await models.getAuth('openai-codex'))?.auth.apiKey;
  if (token)
    return {
      token,
      signaling: SIGNALING_URL,
      sideband: (callId: string) =>
        `wss://api.openai.com/v1/live/${encodeURIComponent(callId)}`,
    };
  throw new Error(
    'Voice and dictation need the OpenAI Codex (legacy) sign-in: Settings → Providers',
  );
}

// The ChatGPT account comes from the sign-in's JWT.
function accountOf(token: string) {
  try {
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
    );
    return claims['https://api.openai.com/auth']?.chatgpt_account_id;
  } catch {
    return undefined;
  }
}

function headers(token: string, id: string) {
  const account = accountOf(token);
  return {
    Authorization: `Bearer ${token}`,
    'OpenAI-Alpha': 'quicksilver=v2',
    'User-Agent': `Codex Desktop/${CLIENT_VERSION}`,
    originator: 'Codex Desktop',
    version: CLIENT_VERSION,
    'x-session-id': id,
    'session-id': id,
    'thread-id': id,
    ...(account ? { 'chatgpt-account-id': account } : {}),
  };
}

/**
 * Dictation, on the endpoint Codex Desktop dictates with. ChatGPT keeps the
 * recording for 30 days.
 */
export async function transcribe(audio: string, mimeType: string) {
  const { token } = await route();
  const account = accountOf(token);
  const form = new FormData();
  const ext = mimeType.split(/[/;]/)[1] ?? 'webm';
  form.append(
    'file',
    new Blob([Buffer.from(audio, 'base64')], { type: mimeType }),
    `dictation.${ext}`,
  );
  const response = await fetch('https://chatgpt.com/backend-api/transcribe', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': `Codex Desktop/${CLIENT_VERSION}`,
      originator: 'Codex Desktop',
      ...(account ? { 'ChatGPT-Account-Id': account } : {}),
    },
    body: form,
  });
  if (!response.ok)
    throw new Error(
      `Dictation failed: ${response.status} ${await response.text()}`.slice(
        0,
        300,
      ),
    );
  const { text } = (await response.json()) as { text?: string };
  return { text: text?.trim() ?? '' };
}

type Call = { socket: WebSocket; stop: () => void };
const calls = new Map<string, Call>();

/**
 * Starts a call on a session: forwards the browser's WebRTC offer and
 * returns OpenAI's answer. Audio then flows browser ↔ OpenAI; the events
 * come here.
 */
export async function startCall(sessionId: string, sdp: string) {
  const session = await voiceSession(sessionId);

  const { token, signaling, sideband } = await route();
  const id = randomUUID();
  // Context appended after connect reads as a turn to answer, so the voice
  // spoke first. In the instructions it is only background.
  const [recent, settings, words] = await Promise.all([
    session.recent(6000),
    session.settings(),
    projectWords(session.cwd),
  ]);
  // GPT-Live has no speed setting: sent at connect, it kills the call at once.
  const speed = settings?.speed ?? 1;
  const instructions = [
    INSTRUCTIONS,
    speed < 0.95 &&
      `Speak ${speed < 0.85 ? 'very slowly' : 'slowly'}, with clear pauses between sentences.`,
    speed > 1.05 && 'Speak quickly.',
    settings?.instructions &&
      `The user's own instructions for calls in this session. Where they differ from the above (language, pace, length, whether to answer yourself), follow these:\n\n${settings.instructions}`,
    words &&
      `Names in this project, so you hear and spell them right when the user says them: ${words}`,
    recent && `Recent conversation in this session:\n\n${recent}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const response = await fetch(signaling, {
    method: 'POST',
    headers: { ...headers(token, id), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sdp,
      session: {
        model: MODEL,
        instructions,
        audio: { output: { voice: VOICE } },
        delegation: { type: 'client' },
      },
    }),
  });
  const answer = await response.text();
  if (!response.ok)
    throw new Error(
      `Voice call refused (${response.status}): ${answer.slice(0, 300)}`,
    );
  const callId = response.headers
    .get('location')
    ?.split('?')[0]
    ?.split('/')
    .find((part) => /^rtc_[\w-]+$/.test(part));
  if (!callId) throw new Error('Voice call has no id');

  // The "sideband": this server's line into the call, for events and results.
  const socket = new WebSocket(sideband(callId), {
    headers: headers(token, id),
  });
  const send = (message: object) => {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  };
  const append = (
    text: string,
    delegation: string,
    channel?: 'commentary' | 'speakable',
  ) => {
    for (const content of chunks(text))
      send({
        type: 'delegation.context.append',
        delegation_item_id: delegation,
        ...(channel ? { channel } : {}),
        content: [{ type: 'input_text', text: content }],
      });
  };

  // A result is the voice's cue to speak, so one appended while the user
  // talks gets spoken over them. It waits until their turn ends, or until
  // their transcript has been quiet for a while.
  const userDone = async () => {
    while (
      turns.you.text &&
      Date.now() - turns.you.heard < USER_QUIET_MS &&
      socket.readyState === WebSocket.OPEN
    )
      await new Promise((resolve) => setTimeout(resolve, 250));
  };
  const finish = async (delegation: string, text: string) => {
    await userDone();
    append(`"Agent Final Message":\n\n${text}`, delegation);
  };

  // Hand-offs waiting for an answer, oldest first: runs answer in order.
  const waiting: string[] = [];
  // Steps between tool calls: quiet progress for the voice.
  const stopCommits = session.onProgress((text) => {
    if (waiting[0]) append(text, waiting[0], 'commentary');
  });

  async function delegate(delegation: string, request: string) {
    if (request === STATUS) {
      return finish(
        delegation,
        (await session.busy())
          ? `Still working${waiting.length > 1 ? `, with ${waiting.length - 1} more request(s) queued` : ''}.`
          : 'Nothing is running.',
      );
    }
    if (request === CANCEL) {
      await session.abort();
      return finish(delegation, 'I stopped the current work.');
    }
    waiting.push(delegation);
    // Long runs: keep telling the voice the work is alive, so it waits.
    const started = Date.now();
    const alive = setInterval(
      () =>
        append(
          `Still working (${Math.round((Date.now() - started) / 1000)} s so far).`,
          delegation,
          'commentary',
        ),
      20_000,
    );
    try {
      const reply = await session.ask(request);
      clearInterval(alive);
      await finish(delegation, reply || 'Done, without a written reply.');
    } finally {
      clearInterval(alive);
      waiting.splice(waiting.indexOf(delegation), 1);
    }
  }

  // What was said goes in the transcript, outside the agent's context. It
  // arrives in pieces (or whole so far) until the turn is done.
  const turns = {
    you: { text: '', at: 0, heard: 0 },
    voice: { text: '', at: 0, heard: 0 },
  };
  const hear = (who: VoiceLine['who'], piece: string) => {
    const turn = turns[who];
    if (!turn.text) turn.at = Date.now();
    turn.heard = Date.now();
    turn.text = piece.startsWith(turn.text) ? piece : turn.text + piece;
  };
  const save = (who: VoiceLine['who']) => {
    const { text, at } = turns[who];
    turns[who] = { text: '', at: 0, heard: 0 };
    if (!text.trim()) return;
    session.save({ who, text: text.trim(), at: at || Date.now() });
  };

  socket.on('message', (data) => {
    let event: {
      type?: string;
      turn?: { role?: string; transcript?: string };
      item?: {
        id: string;
        target?: string;
        text?: string;
        content?: { text?: string }[];
      };
      message?: string;
      error?: unknown;
    };
    try {
      event = JSON.parse((data as Buffer).toString('utf8'));
    } catch {
      return;
    }
    const item = event.item;
    if (event.type === 'input_transcript.added' && item?.text)
      hear('you', item.text);
    if (event.type === 'output_transcript.added' && item?.text)
      hear('voice', item.text);
    if (event.type === 'turn.done') {
      const who = event.turn?.role === 'user' ? 'you' : 'voice';
      if (event.turn?.transcript) turns[who].text = event.turn.transcript;
      save(who);
    }
    if (event.type === 'delegation.created' && item?.target === 'client') {
      const request = (item.content ?? [])
        .map((c) => c.text ?? '')
        .join('\n')
        .trim();
      if (request)
        delegate(item.id, request).catch((error) =>
          finish(
            item.id,
            `That failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    } else if (event.type === 'error')
      console.error('[voice]', event.message ?? event.error);
  });

  const call: Call = {
    socket,
    stop: () => {
      // Hung up mid-sentence: keep what was said so far.
      save('you');
      save('voice');
      stopCommits();
      calls.delete(callId);
      if (socket.readyState <= WebSocket.OPEN) socket.close(1000, 'done');
    },
  };
  calls.set(callId, call);
  socket.on('close', call.stop);
  socket.on('error', (error) => {
    console.error('[voice] sideband', error.message);
    call.stop();
  });

  return { sdp: answer, callId };
}

export function stopCall(callId: string) {
  calls.get(callId)?.stop();
}

const run = promisify(execFile);

/**
 * The branch and the project's file and folder names. Spoken, a name like
 * "CommitBox" or "pi-durable" is easy to mishear; written out, the voice
 * catches it, like a food app that hears a restaurant name better once it
 * knows the restaurants nearby. '' outside a git folder.
 */
async function projectWords(folder: () => Promise<string>) {
  try {
    const cwd = await folder();
    const [files, branch] = await Promise.all([
      run('git', ['-C', cwd, 'ls-files'], { maxBuffer: 16 << 20 }),
      run('git', ['-C', cwd, 'branch', '--show-current']),
    ]);
    const names = new Set<string>();
    if (branch.stdout.trim()) names.add(branch.stdout.trim());
    for (const path of files.stdout.split('\n')) {
      for (const part of path.split('/').slice(0, -1)) names.add(part);
      // Without the extension: people say "CommitBox", not "CommitBox dot tsx".
      const name = basename(path).replace(/\.[^.]+$/, '');
      if (name && !/^(index|README)$/i.test(name)) names.add(name);
    }
    let out = '';
    for (const name of names) {
      if (out.length + name.length > 3000) break;
      out += (out ? ', ' : '') + name;
    }
    return out;
  } catch {
    return '';
  }
}

function chunks(text: string) {
  const out: string[] = [];
  let current = '';
  for (const char of text) {
    if (Buffer.byteLength(current + char) > CHUNK_BYTES) {
      out.push(current);
      current = '';
    }
    current += char;
  }
  out.push(current);
  return out;
}
