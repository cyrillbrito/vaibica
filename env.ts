import * as v from 'valibot';

// Server env, read and validated at boot (server modules import it from
// `virtual:env/server`). Types are generated into solid-env.d.ts.
const modelId = v.pipe(v.string(), v.regex(/^[^/]+\/.+$/));

export default {
  server: {
    // `provider/modelId` new sessions start with until a default is picked
    // in the app. The provider's key comes from Settings or its own env var
    // (e.g. ANTHROPIC_API_KEY), read by pi-ai.
    PI_MODEL: v.optional(modelId, 'anthropic/claude-sonnet-5'),
    // `provider/modelId` of a small, cheap model for quick side jobs: it
    // titles new sessions and drafts commit messages. Unset: titles are the
    // prompt's first words and commit messages are written by hand.
    PI_FAST_MODEL: v.optional(modelId),
    // The web_search and web_fetch tools; a key saved in Settings wins.
    // https://dashboard.exa.ai/api-keys
    EXA_API_KEY: v.optional(v.string()),
  },
  client: {},
};
