// Its own file because vite.config.ts imports it, and Vite restarts whenever a
// file its config imports changes. Here, that's never.
export const SOCKET_PATH = '/ws';
