import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename } from 'node:path';

import type { WorkspaceRef } from '@bica/shared/protocol';
import { inside, open } from './workspace';

// Files reach the browser as plain HTTP, so a big PDF or video needn't fit
// in a socket message. There is no login (docs/deploy.md), so a file is only
// served through a link the socket handed out: an unguessable token keeps
// other websites, including DNS rebinding ones, from reading the disk.
const PREFIX = '/download/';
const TTL = 60 * 60_000;
const links = new Map<string, string>();

/**
 * A URL serving one file for an hour, shown in the browser. Add `?download`
 * to save it instead.
 */
export function fileLink(file: string) {
  const token = crypto.randomUUID();
  links.set(token, file);
  setTimeout(() => links.delete(token), TTL).unref();
  // The name at the end is what the browser shows and saves it as.
  return `${PREFIX}${token}/${encodeURIComponent(basename(file))}`;
}

export async function workspaceFileLink(ref: WorkspaceRef, path: string) {
  const { cwd } = await open(ref);
  return fileLink(inside(cwd, path));
}

/** Answers a request for a download link; false for any other request. */
export function serveDownload(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith(PREFIX)) return false;
  const file = links.get(url.pathname.slice(PREFIX.length).split('/')[0]!);
  if (!file || (req.method !== 'GET' && req.method !== 'HEAD'))
    res.writeHead(404).end();
  else void send(file, url.searchParams.has('download'), req, res);
  return true;
}

async function send(
  file: string,
  save: boolean,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile()) return void res.writeHead(404).end();
  res.writeHead(200, {
    'Content-Type': save ? 'application/octet-stream' : await shownType(file),
    'Content-Length': info.size,
    'Content-Disposition': `${save ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(basename(file))}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return void res.end();
  createReadStream(file).pipe(res);
}

// The page runs on Bica's own origin, so HTML or SVG shown as itself could
// drive the socket. Text shows as plain text, and media as itself.
async function shownType(file: string) {
  const type = Bun.file(file).type.split(';')[0]!;
  if (
    type === 'application/pdf' ||
    /^(audio|video)\//.test(type) ||
    (type.startsWith('image/') && type !== 'image/svg+xml')
  )
    return type;
  if (
    type.startsWith('text/') ||
    /json|javascript|typescript|xml|yaml|toml/.test(type) ||
    type === 'image/svg+xml'
  )
    return 'text/plain; charset=utf-8';
  // Git's own test for names it doesn't know, such as Makefile or .py: a NUL
  // in the first 8000 bytes means binary.
  const head = await Bun.file(file).slice(0, 8000).bytes();
  return head.includes(0)
    ? 'application/octet-stream'
    : 'text/plain; charset=utf-8';
}
