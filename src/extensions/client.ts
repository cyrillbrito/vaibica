import ask from './ask/client';
import type { ClientExtension } from './contract';
import { inOrder } from './manifests';
import terminals from './terminals/client';
import web from './web/client';

/** The client halves of the built-ins. */
export const CLIENT_EXTENSIONS = inOrder<ClientExtension>({
  ask,
  web,
  terminals,
});
