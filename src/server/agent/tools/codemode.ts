import 'server-only';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Context, JsonValue } from '@earendil-works/chord';
import {
  Type,
  validateToolArguments,
  type ClassifierContext,
  type ImageContent,
  type Models,
  type TextContent,
} from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import type {
  Extension,
  ToolExecutionApi,
  ToolRegistration,
  Wrap,
} from '@earendil-works/pi-durable';
import {
  CodemodeSandbox,
  loadQuickJSWasm,
  parseCodemodeSource,
  renderToolSample,
  type CodemodeJsonSchema,
  type CodemodeResult,
  type CodemodeTool,
} from '@earendil-works/pi-codemode';
import { toCodemodeIdentifier } from '@earendil-works/pi-codemode/declarations';
import { withSummary } from './summary';

// A port of the Pi coding agent's `codemode` tool (packages/coding-agent/src/
// extensions/codemode) in its default `on` mode: every tool stays declared and
// its description says how scripts call it. Descriptions and result format are
// Pi's. `models` has only Pi's classifier calls. Left out until there is a use:
// `store()`/`load()`, tool search (only matters for MCP), and image models.

const NAME = 'codemode';

const DESCRIPTION = `Run JavaScript that calls other tools. The input is raw JavaScript (not JSON, no code fence), run as an async function body in a QuickJS sandbox: top-level \`await\` and \`return\` work. No Node, file system, network, or timers.
- \`await tools.<name>({ ...args })\` resolves to a string, or an object if the tool's declaration says so, and rejects with an Error on failure. Calls still running when the script ends are cancelled.
- Optional first line: \`// @options: {"max_output_tokens": 10000, "timeout_ms": 60000}\`

Globals:
- \`text(value)\`, \`image(dataUrlOrImageBlock)\`, \`console.log(...)\`, and top-level \`return\` add output; \`exit()\` ends the script.
- \`ALL_TOOLS\`: every callable tool as \`{ name, description }\`.
- Classifier models answer typed questions about JSON state in well under a second, for about $0.001 per call, instead of chatting. Use them to label many items cheaply, then read only the flagged ones. \`await models.getAvailableOfType("classifier")\` lists them as \`{ provider, id, name }\`. \`await models.classify(model, { state, questions })\` resolves to \`{ answers, usage }\` and rejects on provider errors. Each question is \`{ type: "bool", instructions, criteria: { true, false } }\` answered as \`{ probability }\`, \`{ type: "choice", instructions, criteria: { key: meaning } }\` answered as \`{ choice, probabilities, confidence }\`, or \`{ type: "score", instructions, criteria: [lowest, ..., highest] }\` answered as \`{ score, confidence }\`.`;

const DEFAULT_MAX_OUTPUT_TOKENS = 10_000;
const CHARS_PER_TOKEN = 4;
/** A runaway script must not grow to wasm32's 4 GiB inside the server process. */
const MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;
const ARGS_PREVIEW_CHARS = 200;
const ERROR_PREVIEW_CHARS = 500;
/** What a script gets of bash output; the model sees far less. Head and tail half each. */
const BASH_OUTPUT_MAX_CHARS = 1024 * 1024;

// Pi's bash result for scripts: a non-zero exit still resolves, so `grep`
// finding nothing doesn't throw.
const bashOutputSchema: CodemodeJsonSchema = {
  type: 'object',
  properties: {
    output: {
      type: 'string',
      description: 'Combined stdout and stderr, possibly truncated',
    },
    truncated: { type: 'boolean' },
    full_output_path: {
      type: 'string',
      description: 'Full output, when truncated',
    },
    exit_code: { type: 'number' },
    wall_time_seconds: { type: 'number' },
  },
  required: ['output', 'truncated', 'exit_code', 'wall_time_seconds'],
};
const BASH_RESULT =
  '`{ output, truncated, full_output_path?, exit_code, wall_time_seconds }`';

export interface NestedCall {
  name: string;
  /** Compact JSON of the arguments, cut for display. */
  args: string;
  status: 'running' | 'ok' | 'error' | 'cancelled';
  durationMs?: number;
  error?: string;
}

const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 3)}...` : text;

/** The tool's parameters without Tau's `summary`, which only the transcript uses. */
function scriptParameters(tool: ToolRegistration) {
  const schema = tool.parameters as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const { summary: _summary, ...properties } = schema.properties ?? {};
  return {
    ...schema,
    properties,
    required: schema.required?.filter((name) => name !== 'summary'),
  } as ToolRegistration['parameters'];
}

function declaration(tool: ToolRegistration) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: scriptParameters(tool) as CodemodeJsonSchema,
    outputSchema:
      tool.name === 'bash' ? bashOutputSchema : { type: 'string' as const },
  };
}

/** Pi's `on` mode: the tool's own description, plus how scripts call it. */
const describeScriptCall = (tool: ToolRegistration) =>
  `${tool.description.trim()}\n\nCodemode: \`tools.${toCodemodeIdentifier(tool.name)}(args)\` resolves to ${tool.name === 'bash' ? BASH_RESULT : 'a string'}.`;

const textOf = (content: readonly { type: string }[] | undefined) =>
  (content ?? [])
    .filter((b): b is TextContent => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

/** Runs bash for a script: the whole output (up to 1 MiB) and the exit code. */
async function runBash(
  args: { command: string; timeout?: number },
  api: ToolExecutionApi,
  context: Context,
) {
  const env = api.env;
  if (!env) throw new Error('No execution environment is configured');
  const startedAt = performance.now();
  const half = BASH_OUTPUT_MAX_CHARS / 2;
  let head = '';
  let tail = '';
  let total = 0;
  const result = await env.exec(
    args.command,
    {
      cwd: env.cwd,
      env: {},
      inheritEnv: true,
      ...(args.timeout === undefined ? {} : { timeout: args.timeout }),
      onOutput: (text) => {
        total += text.length;
        if (head.length < half) {
          const room = half - head.length;
          head += text.slice(0, room);
          text = text.slice(room);
        }
        if (text) tail = (tail + text).slice(-half);
      },
      spill: {
        afterBytes: BASH_OUTPUT_MAX_CHARS,
        afterLines: Number.MAX_SAFE_INTEGER,
      },
    },
    context,
  );
  if (!result.ok) {
    if (result.error.code === 'timeout')
      throw new Error(`Command timed out after ${args.timeout} seconds`);
    throw result.error;
  }
  const truncated = total > head.length + tail.length;
  return {
    output: truncated
      ? `${head}\n…${total - head.length - tail.length} characters omitted…\n${tail}`
      : head + tail,
    truncated,
    ...(truncated && result.value.spillPath
      ? { full_output_path: result.value.spillPath }
      : {}),
    exit_code: result.value.exitCode,
    wall_time_seconds: Math.round((performance.now() - startedAt) / 100) / 10,
  };
}

/**
 * Runs a tool for a script: validated like a model's call, its running
 * output collected instead of streamed into the codemode row. Resolves to the
 * text result; a failed call rejects with its error text.
 */
async function runTool(
  tool: ToolRegistration,
  args: unknown,
  api: ToolExecutionApi,
  context: Context,
): Promise<unknown> {
  const prepared = tool.prepareArguments ? tool.prepareArguments(args) : args;
  const valid = validateToolArguments(
    { ...tool, parameters: scriptParameters(tool) },
    {
      type: 'toolCall',
      id: `${api.callId}/nested`,
      name: tool.name,
      arguments: prepared as Record<string, never>,
    },
  );
  if (tool.name === 'bash') return runBash(valid, api, context);
  let output = '';
  const diagnostics: string[] = [];
  const decoder = new TextDecoder();
  const nested: ToolExecutionApi = {
    ...api,
    output: (chunk) => {
      output += typeof chunk === 'string' ? chunk : decoder.decode(chunk);
    },
    diagnostic: (d) => diagnostics.push(d.message),
    details: async () => {},
  };
  const fail = (message: string) =>
    new Error(
      [message, output, ...diagnostics].filter(Boolean).join('\n\n') ||
        `Tool "${tool.name}" failed`,
    );
  let result;
  try {
    result = await tool.execute(valid, nested, context);
  } catch (error) {
    throw fail(error instanceof Error ? error.message : String(error));
  }
  const text = result.content ? textOf(result.content) : output;
  if (result.isError) throw fail(text);
  return text;
}

/** Keeps the start and end of long output; the full text goes to a temp file. */
async function truncate(
  items: (TextContent | ImageContent)[],
  maxTokens: number,
) {
  const combined = items
    .filter((i): i is TextContent => i.type === 'text')
    .map((i) => i.text)
    .join('\n');
  const budget = maxTokens * CHARS_PER_TOKEN;
  if (combined.length <= budget) return items;
  const headChars = Math.floor(budget / 2);
  const tailChars = budget - headChars;
  const removed = combined.length - headChars - tailChars;
  let text = `Warning: truncated output (original token count: ${Math.ceil(combined.length / CHARS_PER_TOKEN)})\nTotal output lines: ${combined.split('\n').length}\n\n${combined.slice(0, headChars)}…${Math.ceil(removed / CHARS_PER_TOKEN)} tokens truncated…${tailChars > 0 ? combined.slice(-tailChars) : ''}`;
  const path = join(tmpdir(), `tau-codemode-${randomUUID()}.txt`);
  try {
    await writeFile(path, combined);
    text += `\n\n[Full output: ${path} (read with offset/limit)]`;
  } catch (error) {
    text += `\n\n[Could not save the full output: ${error instanceof Error ? error.message : String(error)}]`;
  }
  return [
    { type: 'text' as const, text },
    ...items.filter((i) => i.type === 'image'),
  ];
}

function formatError(
  result: Extract<CodemodeResult, { ok: false }>,
  calls: NestedCall[],
) {
  const { error } = result;
  const head =
    error.kind === 'script'
      ? (error.stack ?? `${error.name ?? 'Error'}: ${error.message}`)
      : error.kind === 'timeout'
        ? `Script timed out: ${error.message}`
        : error.kind === 'aborted'
          ? `Script aborted: ${error.message}`
          : `Script sandbox failed: ${error.message}`;
  const summary = calls.length
    ? `Tool calls made before the failure (they are not undone): ${calls.map((c) => `${c.name} (${c.status})`).join(', ')}`
    : 'No tool calls were made.';
  return `${head}\n\n${summary}`;
}

/** Pi's `models` calls for classifiers. Scripts pass models back by provider and id. */
function classifierGlobals(models: Models): CodemodeTool[] {
  const brief = ({
    provider,
    id,
    name,
  }: {
    provider: string;
    id: string;
    name: string;
  }) => ({
    provider,
    id,
    name,
  });
  const onlyClassifiers = (type: unknown) => {
    if (type !== 'classifier')
      throw new Error('Only "classifier" models are available in scripts');
  };
  return [
    {
      name: 'models.getAvailableOfType',
      spread: true,
      execute: async (args) => {
        const [type, provider] = args as [string, string?];
        onlyClassifiers(type);
        return (await models.getAvailableOfType('classifier', provider)).map(
          brief,
        );
      },
    },
    {
      name: 'models.getModelOfType',
      spread: true,
      execute: (args) => {
        const [type, provider, id] = args as [string, string, string];
        onlyClassifiers(type);
        const model = models.getModelOfType('classifier', provider, id);
        return model ? brief(model) : undefined;
      },
    },
    {
      name: 'models.classify',
      spread: true,
      execute: async (args, { signal }) => {
        const [ref, input] = args as [
          { provider?: string; id?: string } | undefined,
          ClassifierContext,
        ];
        const model = models.getModelOfType(
          'classifier',
          ref?.provider ?? '',
          ref?.id ?? '',
        );
        if (!model)
          throw new Error(
            `No classifier model ${ref?.provider}/${ref?.id}. List them with models.getAvailableOfType("classifier").`,
          );
        const result = await models.classify(model, input, { signal });
        if (result.stopReason !== 'stop')
          throw new Error(
            result.errorMessage ?? `Classifier ${result.stopReason}`,
          );
        return { answers: result.answers, usage: result.usage };
      },
    },
  ];
}

/**
 * The codemode tool, able to call the tools of `extensions`. Its wraps add the
 * script call line to each of those tools' descriptions.
 */
export function createCodemode(
  extensions: readonly Extension[],
  models: Models,
): Extension {
  const globals = classifierGlobals(models);
  const callable = new Set(
    extensions.flatMap((e) => e.tools ?? []).map((t) => t.name),
  );

  const codemode = defineTool({
    name: NAME,
    description: DESCRIPTION,
    parameters: Type.Object({
      code: Type.String({ description: 'Raw JavaScript source.' }),
    }),
    execute: async ({ code: input }, api, context) => {
      const startedAt = performance.now();
      const { code, options } = parseCodemodeSource(input);
      const tools = (await api.agent(context)).tools.filter((t) =>
        callable.has(t.name),
      );

      const calls: NestedCall[] = [];
      // Details are commits; one at a time, in order.
      let publishing = Promise.resolve();
      const publish = () => {
        const snapshot = { calls: calls.map((c) => ({ ...c })) };
        publishing = publishing
          .then(() => api.details(snapshot as unknown as JsonValue, context))
          .catch(() => {});
      };

      const sandboxTools: CodemodeTool[] = tools.map((tool) => ({
        name: tool.name,
        description: renderToolSample(declaration(tool)),
        execute: async (args) => {
          const call: NestedCall = {
            name: tool.name,
            args: cut(JSON.stringify(args) ?? '', ARGS_PREVIEW_CHARS),
            status: 'running',
          };
          calls.push(call);
          publish();
          const callStartedAt = performance.now();
          try {
            const value = await runTool(tool, args, api, context);
            call.status = 'ok';
            return value;
          } catch (error) {
            call.status = context.abortSignal?.aborted ? 'cancelled' : 'error';
            call.error = cut(
              error instanceof Error ? error.message : String(error),
              ERROR_PREVIEW_CHARS,
            );
            throw error;
          } finally {
            call.durationMs = performance.now() - callStartedAt;
            publish();
          }
        },
      }));

      const sandbox = new CodemodeSandbox({
        tools: sandboxTools,
        globals,
        timeoutMs: options.timeoutMs ?? Number.POSITIVE_INFINITY,
        memoryLimitBytes: MEMORY_LIMIT_BYTES,
        // The `tau` binary embeds both, where codemode can't find them itself.
        ...(process.env.TAU_CODEMODE_WASM && {
          wasm: loadQuickJSWasm(process.env.TAU_CODEMODE_WASM),
          workerUrl: process.env.TAU_CODEMODE_WORKER,
        }),
      });
      let result: CodemodeResult;
      try {
        result = await sandbox.execute(
          code,
          context.abortSignal ? { signal: context.abortSignal } : {},
        );
      } finally {
        await sandbox.close();
      }
      // Still running: cut off by the script ending, a timeout, or an abort.
      for (const call of calls)
        if (call.status === 'running') call.status = 'cancelled';
      publish();
      await publishing;

      const items: (TextContent | ImageContent)[] = result.output.map((item) =>
        item.type === 'text' ? { type: 'text', text: item.text } : item,
      );
      if (result.ok) {
        if (result.value !== undefined)
          items.push({
            type: 'text',
            text:
              typeof result.value === 'string'
                ? result.value
                : (JSON.stringify(result.value) ?? 'undefined'),
          });
      } else {
        items.push({
          type: 'text',
          text: `Script error:\n${formatError(result, calls)}`,
        });
      }
      const output = await truncate(
        items,
        options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      );
      const wallTime = ((performance.now() - startedAt) / 1000).toFixed(1);
      return {
        content: [
          {
            type: 'text',
            text: `${result.ok ? 'Script completed' : 'Script failed'}\nWall time ${wallTime} seconds\nOutput:\n`,
          },
          ...output,
        ],
        details: { calls } as unknown as JsonValue,
        ...(result.ok ? {} : { isError: true }),
      };
    },
  });

  const wraps: Wrap[] = [...callable].map((name) => ({
    tool: name,
    wrap: (tool: ToolRegistration) => ({
      ...tool,
      description: describeScriptCall(tool),
    }),
  }));

  return defineExtension({
    name: 'codemode',
    tools: [withSummary(codemode as unknown as ToolRegistration)],
    wraps,
  });
}
