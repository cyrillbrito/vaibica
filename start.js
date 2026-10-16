// `bun run start`: the built copy from the repo, through the same entry as the
// `bica` binary, but with its data in the repo's .data/.
process.env.BICA_DATA_DIR ||= '.data';

const { run } = await import('./cli/bica.ts');

await run({
  version: '0.0.0-dev',
  load: async () => ({
    ...(await import('./dist/server/node.js')),
    ...(await import('./dist/server/socket.js')),
  }),
});
