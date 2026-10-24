import ask from './ask/client';
import type { ClientExtension } from './contract';
import { inOrder } from './manifests';

/** The client halves of the built-ins. */
export const CLIENT_EXTENSIONS = inOrder<ClientExtension>({ ask });
