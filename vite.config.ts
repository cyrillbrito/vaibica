import { fileURLToPath } from 'node:url';
import { fileRoutes } from 'filesystem-routing/vite';
import { defineConfig, type Plugin } from 'vite';
import solid from '@solidjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import compression from 'compression';

import { registerServerOnly } from './src/server/server-only.ts';
import { SOCKET_PATH } from './src/lib/socket-path.ts';

// Imported by path, so Vite's config bundler leaves the server to Bun.
const SOCKET_MODULE = fileURLToPath(
  new URL('./src/server/socket.ts', import.meta.url),
);

// The server runs in Vite's own Bun process, imported once: it keeps running
// as it started until Bica restarts, while page edits reload.
function socket(): Plugin {
  return {
    name: 'bica:socket',
    configureServer(server) {
      registerServerOnly();
      let socket: Promise<typeof import('./src/server/socket')> | undefined;
      const load = () => (socket ??= import(/* @vite-ignore */ SOCKET_MODULE));
      // At start, not with the first tab: night runs, idle upkeep, and
      // resumed runs must not wait for a browser.
      server.httpServer?.once('listening', () =>
        load().catch((error) => console.error('[socket]', error)),
      );
      server.httpServer?.on('upgrade', async (req, sock, head) => {
        const { pathname } = new URL(req.url ?? '/', 'http://localhost');
        if (pathname !== SOCKET_PATH) return;
        try {
          (await load()).handleUpgrade(req, sock, head);
        } catch (error) {
          console.error('[socket]', error);
          sock.destroy();
        }
      });
    },
  };
}

// The phone loads the dev server over a slow link (docs/deploy.md), and Vite
// dev sends everything uncompressed. Added before Vite's own middlewares.
function compress(): Plugin {
  return {
    name: 'bica:compress',
    configureServer(server) {
      const gzip = compression();
      // Its types expect Express requests; Vite passes plain Node ones.
      server.middlewares.use((req, res, next) =>
        gzip(req as never, res as never, next),
      );
    },
  };
}

export default defineConfig({
  // No index.html or entry files: the plugin generates them around
  // src/App.tsx, wrapped in src/Document.tsx. `vite build` emits only
  // dist/client; the server runs as Bun source (cli/bica.ts).
  plugins: [
    solid({
      start: true,
      // Dev-only: capture control at /__solid/diagnostics (see docs/UI.md).
      diagnostics: true,
      // On by default in dev, they record every component and effect run and
      // made drawing a long session about 3x slower, which the phone feels.
      // Turn back on briefly to read a trace in Chrome's Performance panel.
      performanceTracks: false,
      // Also compile the `?pick=` route modules fileRoutes emits.
      extensions: ['.jsx', '.tsx'],
    }),
    fileRoutes({ types: true }),
    tailwindcss(),
    socket(),
    compress(),
  ],
  // Own ports so other projects never collide (live is 3141, see cli/bica.ts);
  // fail instead of hopping so the tailscale serve mapping stays right.
  server: {
    port: Number(process.env.BICA_PORT || 3142),
    strictPort: true,
    // Reached from the phone through `tailscale serve` (docs/deploy.md).
    allowedHosts: ['.ts.net'],
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
  },
});
