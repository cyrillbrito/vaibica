import { fileRoutes } from 'filesystem-routing/vite';
import { createServerModuleRunner, defineConfig, type Plugin } from 'vite';
import solid from '@solidjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import compression from 'compression';

import { SOCKET_PATH } from './src/lib/socket-path.ts';

const SOCKET_MODULE = './src/server/socket.ts';

// In dev, upgrades run through Vite's SSR module graph; in production,
// emit the socket module for cli/bica.ts to attach to the built server.
function socket(): Plugin {
  return {
    name: 'bica:socket',
    // After the Solid plugin, so the entry names below win.
    enforce: 'post',
    config: (_, { command }) =>
      command !== 'build'
        ? undefined
        : {
            environments: {
              ssr: {
                build: {
                  rollupOptions: {
                    input: { socket: SOCKET_MODULE },
                    output: {
                      entryFileNames: (chunk) =>
                        chunk.name === 'socket' ? 'socket.js' : 'server.js',
                    },
                  },
                },
              },
            },
          },
    configureServer(server) {
      // Its own runner without HMR, imported once: the server code runs once
      // and keeps running as it started until Bica restarts. The SSR runner
      // reloads on any page edit, and every import checks for changes, so
      // either would run a second copy next to the agents.
      let socket: Promise<typeof import('./src/server/socket')> | undefined;
      const load = () =>
        (socket ??= createServerModuleRunner(server.environments.ssr, {
          hmr: false,
        }).import(SOCKET_MODULE));
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
  // src/App.tsx, wrapped in src/Document.tsx. `vite build` emits dist/client,
  // dist/server, and the Node server (dist/server/node.js) cli/bica.ts runs.
  plugins: [
    solid({
      start: { node: true },
      // Renders only the empty shell; work data arrives over the socket.
      ssr: true,
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
