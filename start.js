// Production entry: run Solid's generated Node-compatible server on Bun,
// with the same WebSocket module used in development.
// Localhost only: remote access goes through `tailscale serve` (docs/deploy.md).
process.env.PORT ??= '3141';
process.env.HOST ??= '127.0.0.1';

const { serve } = await import('./dist/server/node.js');
const { attach } = await import('./dist/server/socket.js');

attach(serve());
