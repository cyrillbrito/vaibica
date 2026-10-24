import 'server-only';
import ask from './ask/server';
import type { ServerExtension } from './contract';
import { inOrder } from './manifests';
import web from './web/server';

/** The server halves of the built-ins. */
export const SERVER_EXTENSIONS = inOrder<ServerExtension>({ ask, web });
