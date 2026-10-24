import type { Manifest } from '../contract';

export const web = {
  id: 'web',
  title: 'Web search',
  about:
    'The agent can search the web and read pages, through Exa. The free plan is enough.',
  on: true,
  tools: { web_search: {}, web_fetch: {} },
  settings: {
    // Under Providers, the key was saved as `exa` too, so it still counts.
    exa: {
      type: 'secret',
      label: 'Exa API key',
      link: { label: 'API keys', url: 'https://dashboard.exa.ai/api-keys' },
    },
  },
} as const satisfies Manifest;
