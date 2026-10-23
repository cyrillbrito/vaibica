import * as v from 'valibot';

// Server env, read and validated at boot (server modules import it from
// `virtual:env/server`). Types are generated into solid-env.d.ts.
const modelId = v.pipe(v.string(), v.regex(/^[^/]+\/.+$/));

export default {
  server: {
    // `provider/modelId` new sessions start with until a default is picked
    // in the app. Its key or sign-in comes from Settings → Providers.
    PI_MODEL: v.optional(modelId, 'anthropic/claude-sonnet-5'),
    // `provider/modelId` of a small, cheap model for quick side jobs: it
    // titles new sessions and drafts commit messages. Unset: titles are the
    // prompt's first words and commit messages are written by hand.
    PI_FAST_MODEL: v.optional(modelId),
  },
  client: {},
};
