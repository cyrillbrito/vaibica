// Loaded before every test file (bunfig.toml). Server code imports two
// modules only Vite provides; this gives Bun the same ones.
import { plugin } from 'bun';
import * as v from 'valibot';

import schema from '../../env';

plugin({
  name: 'bica-vite-modules',
  setup(build) {
    build.module('server-only', () => ({ exports: {}, loader: 'object' }));
    build.module('virtual:env/server', () => ({
      exports: { env: v.parse(v.object(schema.server), process.env) },
      loader: 'object',
    }));
  },
});
