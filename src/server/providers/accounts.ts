import 'server-only';
import { randomUUID } from 'node:crypto';
import type { AuthInteraction, AuthType } from '@earendil-works/pi-ai';

import type { Account, Accounts, SignIn } from '#lib/protocol';
import { credentials, deviceId, exaKey } from './credentials';
import { models } from './registry';
import { live } from '#server/live';
import { refreshModels } from './models';
import { onProxyChange, PROXY_ID, proxyStatus } from './proxy';

// Always listed, with a guide; other providers show once they have a key.
const GUIDES: Record<
  string,
  Pick<Account, 'about' | 'link' | 'env'> & {
    name?: string;
    signIn?: string;
    noSignIn?: boolean;
  }
> = {
  anthropic: {
    about:
      'Sign in with a Claude Pro or Max plan, or add an API key (billed per use).',
    link: {
      label: 'API keys',
      url: 'https://console.anthropic.com/settings/keys',
    },
    signIn: 'Sign in with Claude',
    env: 'ANTHROPIC_OAUTH_TOKEN or ANTHROPIC_API_KEY',
  },
  'openai-codex': {
    name: 'ChatGPT',
    signIn: 'Sign in with ChatGPT',
    about:
      'Sign in with a ChatGPT Plus or Pro plan: sessions get the Codex models, and voice calls use it.',
    link: null,
    env: null,
  },
  // pi-ai also offers OpenAI's newer Sign in with ChatGPT here; it failed
  // for us, so ChatGPT plans go through the Codex sign-in above.
  openai: {
    about: 'An API key, billed per use.',
    link: { label: 'API keys', url: 'https://platform.openai.com/api-keys' },
    env: 'OPENAI_API_KEY',
    noSignIn: true,
  },
  exa: {
    name: 'Exa',
    about: "The agents' web search and page fetch. The free plan is enough.",
    link: { label: 'API keys', url: 'https://dashboard.exa.ai/api-keys' },
    env: 'EXA_API_KEY',
  },
};

async function status(id: string): Promise<Account['status']> {
  const saved = await credentials.read(id);
  if (saved)
    return {
      type: saved.type,
      saved: true,
      source: saved.type === 'oauth' ? 'Signed in' : 'Key saved',
    };
  if (id === 'exa')
    return (await exaKey())
      ? { type: 'api_key', saved: false, source: 'EXA_API_KEY' }
      : null;
  const check = await models.checkAuth(id).catch(() => undefined);
  return check
    ? { type: check.type, saved: false, source: check.source ?? 'Configured' }
    : null;
}

async function accounts(): Promise<Account[]> {
  const list = await Promise.all(
    models.getProviders().map(async (p): Promise<Account | undefined> => {
      // Settings has its own section for the proxy.
      if (p.id === PROXY_ID) return undefined;
      const guide = GUIDES[p.id];
      const current = await status(p.id);
      if (!guide && !current) return undefined;
      const methods: Account['methods'] = [];
      if (p.auth.oauth && !guide?.noSignIn)
        methods.push({
          type: 'oauth',
          label: guide?.signIn ?? p.auth.oauth.loginLabel ?? 'Sign in',
        });
      if (p.auth.apiKey?.login)
        methods.push({ type: 'api_key', label: 'Add key' });
      return {
        id: p.id,
        name: guide?.name ?? p.name,
        about: guide?.about ?? null,
        link: guide?.link ?? null,
        env: guide?.env ?? null,
        status: current,
        methods,
      };
    }),
  );
  const featured = Object.keys(GUIDES);
  const rank = (a: Account) =>
    featured.includes(a.id) ? featured.indexOf(a.id) : featured.length - 1.5;
  const exa: Account = {
    id: 'exa',
    name: 'Exa',
    about: GUIDES.exa!.about,
    link: GUIDES.exa!.link,
    env: GUIDES.exa!.env,
    status: await status('exa'),
    methods: [{ type: 'api_key', label: 'Add key' }],
  };
  return [...list.filter((a) => !!a), exa].sort((a, b) => rank(a) - rank(b));
}

type Run = {
  state: SignIn;
  abort: AbortController;
  answers: Map<string, (value: string) => void>;
};
let current: Run | undefined;

const feed = live<Accounts>(async () => ({
  accounts: await accounts(),
  signIn: current ? structuredClone(current.state) : null,
  proxy: await proxyStatus(),
}));

export const watchAccounts = feed.watch;
onProxyChange(() => void feed.refresh());

async function changed() {
  await Promise.all([feed.refresh(), refreshModels()]);
}

// Exa has no pi-ai provider: its sign-in is one prompt for the key.
async function exaSignIn(interaction: AuthInteraction) {
  const key = (
    await interaction.prompt({ type: 'secret', message: 'Exa API key' })
  ).trim();
  if (!key) throw new Error('Expected a key');
  await credentials.modify('exa', async () => ({ type: 'api_key', key }));
}

/** Runs a provider's sign-in; its steps show on `accounts`. */
export async function signIn(id: string, type: AuthType) {
  current?.abort.abort();
  const run: Run = {
    state: {
      id: randomUUID(),
      account: id,
      url: null,
      instructions: null,
      device: null,
      notes: [],
      progress: null,
      prompt: null,
      error: null,
    },
    abort: new AbortController(),
    answers: new Map(),
  };
  current = run;
  const { state, abort } = run;
  const update = () => {
    if (current === run) void feed.refresh();
  };

  const interaction: AuthInteraction = {
    signal: abort.signal,
    notify(event) {
      if (event.type === 'auth_url') {
        state.url = event.url;
        state.instructions = event.instructions ?? null;
      } else if (event.type === 'device_code')
        state.device = { code: event.userCode, uri: event.verificationUri };
      else if (event.type === 'info')
        state.notes.push({
          message: event.message,
          links: [...(event.links ?? [])],
        });
      else state.progress = event.message;
      update();
    },
    prompt: (prompt) =>
      new Promise((resolve, reject) => {
        const promptId = randomUUID();
        const signal = prompt.signal
          ? AbortSignal.any([prompt.signal, abort.signal])
          : abort.signal;
        // A flow may withdraw its prompt, e.g. when the callback page wins.
        const close = () => {
          run.answers.delete(promptId);
          if (state.prompt?.id === promptId) state.prompt = null;
          update();
        };
        signal.addEventListener(
          'abort',
          () => {
            close();
            reject(new Error('Cancelled'));
          },
          { once: true },
        );
        run.answers.set(promptId, (value) => {
          close();
          resolve(value);
        });
        state.prompt = {
          id: promptId,
          type: prompt.type,
          message: prompt.message,
          placeholder:
            'placeholder' in prompt ? (prompt.placeholder ?? null) : null,
          options: prompt.type === 'select' ? [...prompt.options] : [],
        };
        update();
      }),
  };

  const device = await deviceId();
  void (async () => {
    try {
      if (id === 'exa') await exaSignIn(interaction);
      else
        await models.login(id, type, interaction, {
          getDeviceId: () => device,
        });
      if (current === run) current = undefined;
    } catch (error) {
      if (abort.signal.aborted) return;
      state.error = error instanceof Error ? error.message : String(error);
      state.prompt = null;
      state.progress = null;
    }
    await changed();
  })();
}

export function answer(promptId: string, value: string) {
  const resolve = current?.answers.get(promptId);
  if (!resolve) throw new Error('That question is no longer open');
  resolve(value);
}

export function cancel() {
  current?.abort.abort();
  current = undefined;
  void feed.refresh();
}

export async function signOut(id: string) {
  if (id === 'exa') await credentials.delete('exa');
  else await models.logout(id);
  await changed();
}
