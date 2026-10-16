import 'server-only';
import { Type } from '@earendil-works/pi-ai';
import type { ToolRegistration } from '@earendil-works/pi-durable';

// The transcript shows `summary` next to the tool name, so a call reads at a
// glance instead of only as a raw bash command, path, or URL. Optional so
// codemode scripts, whose calls show no summary, can leave it out.
const summary = Type.Optional(
  Type.String({
    description:
      'Always set it when you call the tool yourself: what this call does and why, in plain words, shown to the user next to the tool name. At most ~10 words, no trailing period. E.g. "Find where sessions are created", "Run the type checker", "Add summary param to tools".',
  }),
);

export function withSummary(tool: ToolRegistration): ToolRegistration {
  // Optional properties carry their own marker, so they stay optional.
  const { properties } = tool.parameters as {
    properties: Record<string, typeof summary>;
  };
  return {
    ...tool,
    parameters: Type.Object({ summary, ...properties }),
    execute: (args, api, context) => {
      const { summary: _summary, ...rest } = args as Record<string, unknown>;
      return tool.execute(rest, api, context);
    },
  };
}
