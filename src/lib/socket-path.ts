// Its own file because vite.config.ts imports it: Vite restarts on every
// change to a config import, which closes the module runner live agents use.
export const SOCKET_PATH = '/ws';
