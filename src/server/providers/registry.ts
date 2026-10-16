import 'server-only';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';

import { credentials } from './credentials';
import { timeThinking } from './thinking-time';

// Every model Tau can call: the harness, the fast model, and voice share it.
// Keys: env vars, or Settings → Providers. The proxy adds itself (proxy.ts).
export const models = builtinModels({ credentials });
timeThinking(models);
