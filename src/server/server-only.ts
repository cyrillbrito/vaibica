// Server files start with `import 'server-only'`, a module Solid's Vite plugin
// provides so the browser bundle fails if it reaches one. Bun runs the server
// and has no such module, so it gets an empty one: at runtime through
// `registerServerOnly`, and in `Bun.build` through `serverOnly`. Bun's runtime
// ignores `onResolve` for package names, hence the two.
import type { BunPlugin } from 'bun';

export function registerServerOnly() {
  Bun.plugin({
    name: 'server-only',
    setup(build) {
      build.module('server-only', () => ({ exports: {}, loader: 'object' }));
    },
  });
}

export const serverOnly: BunPlugin = {
  name: 'server-only',
  setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({
      path: 'server-only',
      namespace: 'server-only',
    }));
    build.onLoad({ filter: /.*/, namespace: 'server-only' }, () => ({
      contents: '',
      loader: 'js',
    }));
  },
};
