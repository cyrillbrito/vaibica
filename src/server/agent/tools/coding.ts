import 'server-only';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { defineExtension } from '@earendil-works/pi-durable';
import type { ToolRegistration } from '@earendil-works/pi-durable';
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
} from '@earendil-works/pi-durable/tools';
import { fitImage } from './fit-image';
import { withSummary } from './summary';

/**
 * Workaround: Pi Durable's read refuses images ("not supported yet" in its
 * README, pi-durable 1.0.4), so this sends them to the model the way the Pi
 * coding agent's read does. Too big ones are shrunk (src/server/agent/tools/fit-image.ts),
 * since a session holding one would fail every later request. Delete it once
 * Durable's read takes images.
 */
function readingImages(tool: ToolRegistration): ToolRegistration {
  return {
    ...tool,
    description:
      'Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.',
    execute: async (args, api, context) => {
      const result = await tool.execute(args, api, context);
      const refusal = result.diagnostics?.find(
        (d) => d.code === 'unsupported_image',
      );
      const mimeType = refusal?.message.match(/\((image\/[\w+.-]+)\)/)?.[1];
      const env = api.env;
      if (!mimeType || !env) return result;
      const { path } = args as { path: string };
      const read = await env.readBinaryFile(
        isAbsolute(path) ? path : join(env.cwd, path),
        context,
      );
      if (!read.ok) throw read.error;
      const image = await fitImage(read.value, mimeType);
      return {
        content: [
          {
            type: 'image',
            data: Buffer.from(image.bytes).toString('base64'),
            mimeType: image.mimeType,
          },
        ],
      };
    },
  };
}

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

// Only the hub profile selects it (src/server/profiles/definitions.ts).
export const HubFileTools = defineExtension({
  name: 'hub-file-tools',
  tools: [
    readingImages(createReadTool() as unknown as ToolRegistration),
    ownFolder(createWriteTool() as unknown as ToolRegistration),
    ownFolder(createEditTool() as unknown as ToolRegistration),
  ].map(withSummary),
});

export const CodingTools = defineExtension({
  name: 'coding-tools',
  tools: [
    readingImages(createReadTool() as unknown as ToolRegistration),
    createWriteTool() as unknown as ToolRegistration,
    createEditTool() as unknown as ToolRegistration,
    createBashTool() as unknown as ToolRegistration,
  ].map((tool) => withSummary(tool as unknown as ToolRegistration)),
});
