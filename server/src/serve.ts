import { serveBlob } from './git/blob';
import { serveDownload } from './git/download';
import { serveAttachment } from './sessions/attachments';
import { upgrade, websocket } from './socket';

/**
 * Bica's HTTP server: the socket, and the files it hands out links to.
 * `fallback` answers every other URL with the built app in production; in
 * dev, Vite serves the app and forwards the rest here, and anything else is
 * a 404. GET routes answer HEAD too, and other methods get a 404.
 */
export function serve(
  port: number,
  fallback?: (req: Request) => Response | Promise<Response>,
) {
  return Bun.serve({
    hostname: '127.0.0.1',
    port,
    routes: {
      '/ws': upgrade,
      '/download/:token/*': { GET: serveDownload },
      '/blob/:hash': { GET: serveBlob },
      '/attachment/:name': { GET: serveAttachment },
    },
    fetch: fallback,
    websocket,
  });
}
