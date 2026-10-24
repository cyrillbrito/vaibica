import 'server-only';
import ask from './ask/server';
import type { ServerExtension } from './contract';
import { inOrder } from './manifests';

/** The server halves of the built-ins. */
export const SERVER_EXTENSIONS = inOrder<ServerExtension>({ ask });
