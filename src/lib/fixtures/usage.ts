// Test data for what fills a session's context, the model catalog, the
// providers in Settings, and plan usage (`?data=demo`, `?data=worst`). Compact
// and clean up play out on the test sessions, so the context field can be
// seen shimmering and clearing.
import { createSignal } from 'solid-js';

import type { ContextUsage, Group, Part } from '../context-usage';
import type {
  Accounts,
  ModelCatalog,
  PlanUsage,
  ThinkingLevel,
} from '../protocol';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = Date.now();

const RESERVE = 16_384;
const BACKGROUND = 32_768;

type Shape = 'running' | 'finished' | 'asking';

const part = (
  key: string,
  label: string,
  group: Group,
  tokens: number,
  detail?: string,
): Part => ({ key, label, group, tokens, detail });

// Parts per shape: [system, tools, conversation], largest first in each.
function parts(shape: Shape, worst: boolean): Part[] {
  const system = [
    part('instructions', 'Instructions', 'system', 3_100),
    part('project', 'AGENTS.md', 'system', 2_400),
    part(
      'skills',
      'Skills',
      'system',
      1_300,
      worst
        ? 'agent-browser, frontend-design, twg, twg-jira, twg-confluence, twg-engineering-work, ponytail, but, writing'
        : 'agent-browser, frontend-design',
    ),
    part('system', 'Base prompt', 'system', 900),
  ];
  const tools = [
    part('tool:bash', 'bash', 'tools', 2_900),
    part('tool:edit', 'edit', 'tools', 2_100),
    part('tool:codemode', 'codemode', 'tools', 1_800),
    part('tool:read', 'read', 'tools', 1_200),
    part('tool:ask', 'ask', 'tools', 700),
  ];
  const scale = { running: 1, finished: 1.7, asking: 0.32 }[shape];
  const talk = [
    part('result:read', 'read results', 'conversation', 61_000 * scale),
    part('result:bash', 'bash results', 'conversation', 38_000 * scale),
    part('replies', 'Replies', 'conversation', 21_000 * scale),
    part('thinking', 'Thinking', 'conversation', 17_000 * scale),
    part('calls', 'Tool calls', 'conversation', 9_400 * scale),
    part('prompts', 'Prompts', 'conversation', 4_100 * scale),
    part('images', 'Images', 'conversation', shape === 'asking' ? 0 : 3_200),
  ].filter((p) => p.tokens > 0);
  if (worst)
    talk.push(
      part(
        'result:mcp__northwind__very_long_tool_name_that_never_ends',
        'mcp__northwind__very_long_tool_name_that_never_ends results',
        'conversation',
        44_000,
      ),
    );
  return [...system, ...tools, ...talk].map((p) => ({
    ...p,
    tokens: Math.round(p.tokens / 100) * 100,
  }));
}

function usage(shape: Shape, worst: boolean): ContextUsage {
  const all = parts(shape, worst);
  const used = all.reduce((n, p) => n + p.tokens, 0);
  // The finished one sits on a 1M window, so it can grow past 200k.
  const window = shape === 'finished' ? 1_000_000 : 200_000;
  const compactAt = window - RESERVE;
  const results = all.filter((p) => p.key.startsWith('result:'));
  return {
    used,
    measured: shape !== 'asking',
    window,
    compactAt,
    backgroundAt: compactAt - BACKGROUND,
    parts: all,
    biggest: [
      {
        label: 'read',
        detail: 'src/components/Sidebar.tsx',
        tokens: 14_200,
        target: { call: 'fixture-read' },
      },
      {
        label: 'bash',
        detail: 'bun run check',
        tokens: 9_800,
        target: { call: 'fixture-bash' },
      },
      {
        label: 'Reply',
        detail: 'The sidebar overflowed because the badge row had no min-w-0.',
        tokens: 2_100,
        target: { key: 'fixture-reply' },
      },
    ],
    misses: worst ? 7 : 1,
    spend:
      shape === 'asking'
        ? []
        : [
            {
              model: 'anthropic/claude-opus-4-5',
              input: 18_000,
              cacheRead: 2_400_000,
              cacheWrite: 210_000,
              output: 41_000,
              cost: 3.86,
            },
            {
              model: 'anthropic/claude-haiku-4-5',
              input: 52_000,
              cacheRead: 120_000,
              cacheWrite: 8_000,
              output: 3_900,
              cost: 0.09,
            },
            {
              model: worst
                ? 'openrouter/qwen/qwen3-coder-480b-a35b-instruct-turbo-preview'
                : 'openai-codex/gpt-5.1-codex',
              input: 640_000,
              cacheRead: 3_100_000,
              cacheWrite: 0,
              output: 22_000,
              cost: 1.42,
            },
          ],
    // Warm for 4 more minutes when idle, so the countdown shows.
    cache:
      shape === 'running'
        ? undefined
        : {
            at: now - (shape === 'finished' ? 2 * HOUR : 56 * MIN),
            ttl: HOUR,
          },
    compacting: false,
    running: shape === 'running',
    cleanable: Math.round(results.reduce((n, p) => n + p.tokens, 0) * 0.74),
  };
}

/**
 * One session's context, with compact and clean up that play out: the
 * cells shimmer for a few seconds, then the conversation shrinks.
 */
export function fixtureContext(shape: Shape, worst: boolean) {
  const [value, setValue] = createSignal(usage(shape, worst), {
    name: 'fixtureContext',
  });
  const shrink = (keep: (p: Part) => number) => {
    const v = value();
    const next = v.parts
      .map((p) => ({ ...p, tokens: Math.round(keep(p) / 100) * 100 }))
      .filter((p) => p.tokens > 0);
    const used = next.reduce((n, p) => n + p.tokens, 0);
    setValue({
      ...v,
      parts: next,
      used,
      compacting: false,
      cleanable: 0,
      biggest: [],
    });
  };
  return {
    value,
    // Like the server: the call answers once it has started.
    compact: async () => {
      setValue((v) => ({ ...v, compacting: true }));
      setTimeout(
        () =>
          shrink((p) =>
            p.group !== 'conversation'
              ? p.tokens
              : p.key === 'replies'
                ? 7_800
                : p.tokens * 0.08,
          ),
        3200,
      );
    },
    cleanup: async () => {
      await new Promise((r) => setTimeout(r, 1600));
      const v = value();
      const results = v.parts.filter((p) => p.key.startsWith('result:'));
      const total = results.reduce((n, p) => n + p.tokens, 0);
      const share = total ? 1 - v.cleanable / total : 1;
      shrink((p) =>
        p.key.startsWith('result:') ? p.tokens * share : p.tokens,
      );
    },
  };
}

const LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high'];
const CLAUDE: ThinkingLevel[] = ['off', 'low', 'medium', 'high', 'max'];
const CODEX: ThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];

type Model = ModelCatalog['models'][number];
const model = (
  provider: string,
  id: string,
  name: string,
  levels: ThinkingLevel[],
  contextWindow: number,
  cost: [input: number, output: number, cacheRead: number],
  images = true,
): Model => ({
  provider,
  id,
  name,
  levels,
  contextWindow,
  cost: { input: cost[0], output: cost[1], cacheRead: cost[2] },
  images,
  cacheTtl: provider === 'anthropic' ? { short: 300, long: 3600 } : {},
});

/** The catalog: list prices from pi-ai's model data, as of writing. */
export function fixtureCatalog(worst: boolean): ModelCatalog {
  const models: Model[] = [
    model(
      'anthropic',
      'claude-opus-4-5',
      'Claude Opus 4.5',
      CLAUDE,
      200_000,
      [5, 25, 0.5],
    ),
    model(
      'anthropic',
      'claude-sonnet-4-5',
      'Claude Sonnet 4.5',
      CLAUDE,
      1_000_000,
      [3, 15, 0.3],
    ),
    model(
      'anthropic',
      'claude-haiku-4-5',
      'Claude Haiku 4.5',
      CLAUDE,
      200_000,
      [1, 5, 0.1],
    ),
    model(
      'openai-codex',
      'gpt-5.1-codex',
      'GPT-5.1 Codex',
      CODEX,
      400_000,
      [1.25, 10, 0.125],
    ),
    model(
      'openai-codex',
      'gpt-5.1-codex-mini',
      'GPT-5.1 Codex mini',
      CODEX,
      400_000,
      [0.25, 2, 0.025],
    ),
    model(
      'openrouter',
      'moonshotai/kimi-k2-thinking',
      'Kimi K2 Thinking',
      LEVELS,
      262_144,
      [0.6, 2.5, 0.15],
      false,
    ),
    model(
      'openrouter',
      'z-ai/glm-4.6',
      'GLM 4.6',
      LEVELS,
      202_752,
      [0.4, 1.75, 0],
      false,
    ),
    model(
      'openrouter',
      'meta-llama/llama-3.3-70b-instruct',
      'Llama 3.3 70B Instruct',
      [],
      131_072,
      [0.13, 0.39, 0],
      false,
    ),
  ];
  if (worst)
    models.push(
      model(
        'openrouter',
        'qwen/qwen3-coder-480b-a35b-instruct-turbo-preview',
        'Qwen: Qwen3 Coder 480B A35B Instruct Turbo (preview, experimental)',
        LEVELS,
        1_048_576,
        [0, 0, 0],
        false,
      ),
    );
  return {
    providers: [
      { id: 'anthropic', name: 'Anthropic', source: 'Claude Pro/Max' },
      { id: 'openai-codex', name: 'ChatGPT', source: 'ChatGPT Plus/Pro' },
      { id: 'openrouter', name: 'OpenRouter', source: 'OPENROUTER_API_KEY' },
    ],
    models,
    settings: {
      model: { provider: 'anthropic', modelId: 'claude-opus-4-5' },
      thinkingLevel: 'medium',
      enabled: [],
      fastModel: { provider: 'anthropic', modelId: 'claude-haiku-4-5' },
      stageOnView: false,
      longCache: true,
      hubFolder: null,
      hubModel: null,
    },
    fromEnv: { model: false, fastModel: false },
    compaction: { reserveTokens: RESERVE, backgroundTokens: BACKGROUND },
  };
}

export function fixtureAccounts(worst: boolean): Accounts {
  const key = { type: 'api_key' as const, label: 'Add API key' };
  return {
    accounts: [
      {
        id: 'anthropic',
        name: 'Anthropic',
        about: 'Claude models, with a Pro or Max plan or an API key.',
        link: { label: 'Get a key', url: 'https://console.anthropic.com' },
        env: 'ANTHROPIC_API_KEY',
        status: { type: 'oauth', saved: true, source: 'Claude Pro/Max' },
        methods: [{ type: 'oauth', label: 'Sign in with Claude' }, key],
      },
      {
        id: 'openai-codex',
        name: 'ChatGPT',
        about: 'Codex models with a ChatGPT plan.',
        link: null,
        env: null,
        status: { type: 'oauth', saved: true, source: 'ChatGPT Plus/Pro' },
        methods: [{ type: 'oauth', label: 'Sign in with ChatGPT' }],
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        about: 'Hundreds of models behind one key.',
        link: { label: 'Get a key', url: 'https://openrouter.ai/keys' },
        env: 'OPENROUTER_API_KEY',
        status: {
          type: 'api_key',
          saved: false,
          source: 'OPENROUTER_API_KEY',
        },
        methods: [key],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        about: 'GPT models billed per token.',
        link: {
          label: 'Get a key',
          url: 'https://platform.openai.com/api-keys',
        },
        env: 'OPENAI_API_KEY',
        status: null,
        methods: [key],
      },
      {
        id: 'exa',
        name: 'Exa',
        about: worst
          ? 'Web search and fetch for the agent. Without it, the agent searches with a slower fallback that reads only the first page of results and often misses recent pages, which is why a key is worth setting up even on a free plan.'
          : 'Web search and fetch for the agent.',
        link: { label: 'Get a key', url: 'https://dashboard.exa.ai' },
        env: 'EXA_API_KEY',
        status: null,
        methods: [key],
      },
    ],
    signIn: null,
    proxy: worst
      ? {
          url: 'https://legion-northwind-industries.tail0a1b2c.ts.net:8317',
          managementKey: true,
          models: 142,
          error: 'GET /v0/management/auth-files: 401 Unauthorized',
        }
      : null,
  };
}

// The CLI proxy's signed-in accounts, the only plans Tau shows.
export function fixturePlanUsage(worst: boolean): PlanUsage {
  return [
    {
      id: 'cliproxy:claude-work',
      provider: 'cliproxy',
      family: 'claude',
      name: 'Claude',
      plan: 'Max 5x',
      updatedAt: now - 3 * MIN,
      windows: [
        {
          key: 'five_hour',
          label: 'Session',
          utilization: worst ? 1 : 0.42,
          resetsAt: now + 2 * HOUR + 14 * MIN,
          limited: worst,
          spent: null,
        },
        {
          key: 'seven_day',
          label: 'Week',
          utilization: 0.86,
          resetsAt: now + 3 * 24 * HOUR,
          limited: false,
          spent: null,
        },
        {
          key: 'seven_day_opus',
          label: 'Opus',
          utilization: 0.31,
          resetsAt: now + 3 * 24 * HOUR,
          limited: false,
          spent: null,
        },
        {
          key: 'extra',
          label: 'Extra',
          utilization: 0.62,
          resetsAt: null,
          limited: false,
          spent: { used: 31, limit: 50, currency: 'USD' },
        },
      ],
    },
    {
      id: 'cliproxy:chatgpt',
      provider: 'cliproxy',
      family: 'gpt',
      name: 'ChatGPT',
      plan: 'Plus',
      updatedAt: now - MIN,
      windows: [
        {
          key: 'primary',
          label: 'Session',
          utilization: 0.12,
          resetsAt: now + 4 * HOUR,
          limited: false,
          spent: null,
        },
        {
          key: 'secondary',
          label: 'Week',
          utilization: 0.4,
          resetsAt: now + 5 * 24 * HOUR,
          limited: false,
          spent: null,
        },
      ],
    },
  ];
}
