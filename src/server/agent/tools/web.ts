import 'server-only';
import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import type { ToolRegistration } from '@earendil-works/pi-durable';
import { withSummary } from './summary';

// Exa does both jobs: search, and fetching a page as clean text.
// https://exa.ai/docs/reference/search · https://exa.ai/docs/reference/get-contents

type ExaResult = {
  title?: string;
  url?: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
};

type ExaResponse = {
  results?: ExaResult[];
  statuses?: {
    id: string;
    status: string;
    error?: { tag?: string; httpStatusCode?: number };
  }[];
};

const DAYS = { day: 1, week: 7, month: 30, year: 365 } as const;

async function exa(
  apiKey: () => Promise<string | undefined>,
  path: string,
  body: object,
  signal: AbortSignal | undefined,
): Promise<ExaResponse> {
  const key = await apiKey();
  if (!key)
    throw new Error(
      'No Exa key: the user can add one in Bica under Settings → Providers',
    );
  const timeout = AbortSignal.timeout(60_000);
  const response = await fetch(`https://api.exa.ai${path}`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Exa ${path} failed (${response.status}): ${text.slice(0, 300)}`,
    );
  }
  return response.json();
}

function heading(result: ExaResult) {
  const date = result.publishedDate
    ? ` (${result.publishedDate.slice(0, 10)})`
    : '';
  return result.title
    ? `## ${result.title}${date}\n${result.url}`
    : `## ${result.url}${date}`;
}

export function createWebTools(apiKey: () => Promise<string | undefined>) {
  const webSearch = defineTool({
    name: 'web_search',
    description:
      'Search the web. Returns the top results with title, URL, date and the most relevant passages. Use web_fetch to read a result in full.',
    parameters: Type.Object({
      query: Type.String({
        description: 'What to search for, in natural language',
      }),
      numResults: Type.Optional(
        Type.Number({ description: 'Number of results (default 5, max 20)' }),
      ),
      recency: Type.Optional(
        Type.Union(
          [
            Type.Literal('day'),
            Type.Literal('week'),
            Type.Literal('month'),
            Type.Literal('year'),
          ],
          { description: 'Only results published within this period' },
        ),
      ),
      domains: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Limit to these domains; prefix with - to exclude one (e.g. "-reddit.com")',
        }),
      ),
    }),
    replay: 'safe',
    async execute({ query, numResults, recency, domains }, _api, context) {
      const include = domains?.filter((d) => !d.startsWith('-'));
      const exclude = domains
        ?.filter((d) => d.startsWith('-'))
        .map((d) => d.slice(1));
      const data = await exa(
        apiKey,
        '/search',
        {
          query,
          type: 'auto',
          numResults: Math.min(Math.max(numResults ?? 5, 1), 20),
          ...(include?.length && { includeDomains: include }),
          ...(exclude?.length && { excludeDomains: exclude }),
          ...(recency && {
            startPublishedDate: new Date(
              Date.now() - DAYS[recency] * 86_400_000,
            ).toISOString(),
          }),
          contents: { highlights: { maxCharacters: 1500 } },
        },
        context.abortSignal,
      );
      const results = data.results ?? [];
      if (!results.length)
        return { output: [{ type: 'text', text: 'No results.' }] };
      const text = results
        .map((r) => `${heading(r)}\n\n${(r.highlights ?? []).join('\n\n')}`)
        .join('\n\n');
      return { output: [{ type: 'text', text }] };
    },
  });

  const webFetch = defineTool({
    name: 'web_fetch',
    description:
      'Read a public web page (articles, docs, PDFs) as clean text. Pass `query` to get only the passages relevant to it instead of the whole page. Cannot reach localhost or private networks; use bash (curl) for those.',
    parameters: Type.Object({
      url: Type.String({ description: 'The page URL' }),
      query: Type.Optional(
        Type.String({
          description: 'Return only the passages relevant to this question',
        }),
      ),
      fresh: Type.Optional(
        Type.Boolean({
          description: 'Skip the cache and fetch the live page (slower)',
        }),
      ),
    }),
    replay: 'safe',
    async execute({ url, query, fresh }, _api, context) {
      const data = await exa(
        apiKey,
        '/contents',
        {
          urls: [url],
          ...(query
            ? { highlights: { query, maxCharacters: 8000 } }
            : { text: { maxCharacters: 50_000 } }),
          ...(fresh && { maxAgeHours: 0 }),
        },
        context.abortSignal,
      );
      const failed = data.statuses?.find((s) => s.status !== 'success');
      const result = data.results?.[0];
      if (failed || !result) {
        const reason = failed?.error?.tag ?? 'no content';
        const status = failed?.error?.httpStatusCode;
        throw new Error(
          `Could not fetch ${url}: ${reason}${status ? ` (HTTP ${status})` : ''}`,
        );
      }
      const body = query
        ? (result.highlights ?? []).join('\n\n')
        : (result.text ?? '');
      return {
        output: [{ type: 'text', text: `${heading(result)}\n\n${body}` }],
      };
    },
  });

  return defineExtension({
    name: 'web',
    tools: [webSearch, webFetch].map((tool) =>
      withSummary(tool as unknown as ToolRegistration),
    ),
  });
}
