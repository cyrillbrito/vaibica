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
