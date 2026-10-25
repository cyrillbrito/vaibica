import type { JsonValue } from '@earendil-works/chord';
import type { Extension, ToolRegistration } from '@earendil-works/pi-durable';

export const timeTools = (extension: Extension): Extension => ({
  ...extension,
  tools: extension.tools?.map(timed),
});

/**
 * Stamps `startedAt` on a running call's details, so its live row counts up.
 * Durable's live slots carry no start time; the finished result has its own
 * `durationMs`. Details are for the UI; the model never sees them.
 */
function timed(tool: ToolRegistration): ToolRegistration {
  return {
    ...tool,
    execute: async (args, api, context) => {
      const startedAt = Date.now();
      const stamp = (details: JsonValue | undefined) =>
        ({ ...(isObject(details) ? details : {}), startedAt }) as JsonValue;
      await api.details(stamp(undefined), context);
      return tool.execute(
        args,
        { ...api, details: (value, c) => api.details(stamp(value), c) },
        context,
      );
    },
  };
}

const isObject = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
