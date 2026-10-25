// `bun run dev` runs this next to Vite: the socket alone, one port above
// Vite's, which serves the pages and forwards the socket here
// (client/vite.config.ts).
import { createServer } from 'node:http';

import { attach } from './src/socket.ts';

const port = Number(process.env.BICA_PORT || 3142) + 1;
const server = createServer((_, res) => res.writeHead(404).end());
attach(server);
server.listen(port, '127.0.0.1', () =>
  console.log(`Bica's server on port ${port}`),
);
