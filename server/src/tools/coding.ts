import { isAbsolute, relative, resolve } from 'node:path';
import { defineExtension } from '@earendil-works/pi-durable';
import type { ToolRegistration } from '@earendil-works/pi-durable';
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
} from '@earendil-works/pi-durable/tools';
import { bunImages } from './fit-image';

/** Whether `path` lies inside `cwd`; the edit tools strip a leading @. */
function inside(cwd: string, path: string) {
  const rel = relative(cwd, resolve(cwd, path.replace(/^@/, '')));
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

/** The hub writes only its own memory files (docs/hub.md). */
function ownFolder(tool: ToolRegistration): ToolRegistration {
  return {
    ...tool,
    description: `${tool.description} Only inside your own folder.`,
    execute: (args, api, context) => {
      const cwd = api.env?.cwd;
      if (!cwd || !inside(cwd, (args as { path: string }).path))
        throw new Error(
          `You can only change files inside your folder, ${cwd}. Hand other changes to a session.`,
        );
      return tool.execute(args, api, context);
    },
  };
}

// Durable's tools are typed by their own schemas; extensions take any.
function any(tool: unknown) {
  return tool as ToolRegistration;
}
function read() {
  return any(createReadTool({ images: bunImages }));
}

// Only the hub agent selects it (server/src/hub/agent.ts).
export const HubFileTools = defineExtension({
  name: 'hub-file-tools',
  tools: [
    read(),
    ownFolder(any(createWriteTool())),
    ownFolder(any(createEditTool())),
  ],
});

export const CodingTools = defineExtension({
  name: 'coding-tools',
  tools: [
    read(),
    any(createWriteTool()),
    any(createEditTool()),
    any(createBashTool()),
  ],
});
