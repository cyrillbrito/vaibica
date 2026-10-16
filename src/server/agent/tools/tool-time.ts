import 'server-only';
import type { JsonValue } from '@earendil-works/chord';
import type { Extension, ToolRegistration } from '@earendil-works/pi-durable';

export const timeTools = (extension: Extension): Extension => ({
  ...extension,
  tools: extension.tools?.map(timed),
});

/**
 * Pi Durable doesn't record how long a call ran, so stamp it on the call's
 * details: `startedAt` while it runs (the live row counts up from it), then
 * `durationMs` on the result. Details are for the UI; the model never sees them.
 */
export function timed(tool: ToolRegistration): ToolRegistration {
  return {
    ...tool,
    execute: async (args, api, context) => {
      const startedAt = Date.now();
      let last: JsonValue | undefined;
      const stamp = (details: JsonValue | undefined, extra: object) =>
        ({
          ...(isObject(details) ? details : {}),
          startedAt,
          ...extra,
        }) as JsonValue;
      await api.details(stamp(undefined, {}), context);
      const result = await tool.execute(
        args,
        {
          ...api,
          details: (value, context) => {
            last = value;
            return api.details(stamp(value, {}), context);
          },
        },
        context,
      );
      return {
        ...result,
        details: stamp(result.details ?? last, {
          durationMs: Date.now() - startedAt,
        }),
      };
    },
  };
}

const isObject = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
