// Builds the `bica` binary into dist/bica/bica: Vite's build, bundled with
// cli/bica.ts, with the client, skills, and codemode's wasm embedded as files.
// Each `--target bun-<os>-<arch>` builds dist/bica/<os>-<arch>/bica instead.
// BICA_VERSION sets the version `bica --version` prints.
import { $, Glob } from 'bun';
import { dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { target: { type: 'string', multiple: true } },
});
const version = process.env.BICA_VERSION || '0.0.0-dev';

const root = join(import.meta.dir, '..');
const out = join(root, 'dist/bica');
const files = (dir: string) => [
  ...new Glob('**/*').scanSync({ cwd: join(root, dir) }),
];

await $`bun run build`.cwd(root);
await $`rm -rf ${out} && mkdir -p ${out}`;

const imports: string[] = [];
const embed = (path: string) => {
  const name = `f${imports.length}`;
  imports.push(
    `import ${name} from ${JSON.stringify(path)} with { type: 'file' };`,
  );
  return name;
};
const map = (entries: [string, string][]) =>
  `{ ${entries.map(([key, name]) => `${JSON.stringify(key)}: ${name}`).join(', ')} }`;

// Vite's own manifest in .vite/ isn't served; the glob skips dot folders.
const client = files('dist/client').map((path): [string, string] => [
  `/${path}`,
  embed(join(root, 'dist/client', path)),
]);
const skills = files('skills').map((path): [string, string] => [
  path,
  embed(join(root, 'skills', path)),
]);
const codemode = Bun.resolveSync('@earendil-works/pi-codemode', root);
const wasm = embed(
  Bun.resolveSync('quickjs-wasi/quickjs.wasm', dirname(codemode)),
);

// node.js starts a server on port 3000 when it's the main module, which it
// is inside a compiled binary, so this copy leaves that line out.
const node = await Bun.file(join(root, 'dist/server/node.js')).text();
const guard = /^if \(process\.argv\[1\].*serve\(\);$/m;
if (!guard.test(node))
  throw new Error('dist/server/node.js changed: check its main-module guard');
await Bun.write(join(root, 'dist/server/node-bica.js'), node.replace(guard, ''));

const entry = join(out, 'entry.js');
await Bun.write(
  entry,
  `${imports.join('\n')}
import { run } from ${JSON.stringify(join(root, 'cli/bica.ts'))};

await run({
  version: ${JSON.stringify(version)},
  load: async () => ({
    ...(await import(${JSON.stringify(join(root, 'dist/server/node-bica.js'))})),
    ...(await import(${JSON.stringify(join(root, 'dist/server/socket.js'))})),
  }),
  client: ${map(client)},
  skills: ${map(skills)},
  wasm: ${wasm},
  // Bun resolves this form from the binary's own module graph.
  worker: './cli/codemode-worker.ts',
});
`,
);

// NODE_ENV picks Solid's production build: without it, Bun's bundler takes
// the "development" export condition.
for (const target of values.target ?? [undefined]) {
  const outfile = join(out, target?.replace(/^bun-/, '') ?? '', 'bica');
  const flags = target ? [`--target=${target}`] : [];
  await $`bun build ${entry} ${join(root, 'cli/codemode-worker.ts')} --compile --production ${flags} --root ${root} --outfile ${outfile}`
    .cwd(root)
    .env({ ...process.env, NODE_ENV: 'production' });
  console.log(`built ${relative(process.cwd(), outfile)}`);
}
await $`rm ${entry}`;
