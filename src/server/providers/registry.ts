import 'server-only';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';

import { credentials } from './credentials';
import { baseOf, extraAccount, isExtra, routeAccounts } from './plans';
import { timeThinking } from './thinking-time';

// Every model Bica can call: the harness, the fast model, and voice share it.
// Keys and sign-ins come only from Settings → Providers: an env var or a
// cloud CLI's login would make an account Bica uses but doesn't list.
export const models = builtinModels({
  credentials,
  authContext: {
    env: async () => undefined,
    fileExists: async () => false,
  },
});
routeAccounts(models);
timeThinking(models);

/** Registers a provider's extra account, `<provider>:<n>` (plans.ts). */
export function addExtraAccount(id: string) {
  const base = models.getProvider(baseOf(id));
  if (!base) throw new Error(`Unknown provider ${baseOf(id)}`);
  if (!models.getProvider(id))
    models.setProvider(extraAccount(base, id.slice(id.indexOf(':') + 1)));
}

// Extra accounts are known by their saved sign-ins.
export const accountsReady = credentials.list().then((saved) => {
  for (const { providerId } of saved)
    if (isExtra(providerId) && models.getProvider(baseOf(providerId)))
      addExtraAccount(providerId);
});

// OpenRouter holds back credit for the whole output ceiling before a turn
// starts, and pi-ai asks for the model's maximum, 128k on Opus, so a low
// balance refuses turns that would cost cents. Claude Code stops at 32k too.
const OPENROUTER_MAX_TOKENS = 32_000;
const stream = models.streamSimple.bind(models);
models.streamSimple = (model, context, options) =>
  stream(
    model,
    context,
    model.provider === 'openrouter'
      ? {
          ...options,
          maxTokens: Math.min(
            options?.maxTokens ?? model.maxTokens,
            OPENROUTER_MAX_TOKENS,
          ),
        }
      : options,
  );
