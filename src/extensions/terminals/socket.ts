import { extensionHref } from '#lib/extensions';
import { extensionSocket } from '#lib/socket';
import type { WorkspaceRef } from '#lib/protocol';
import type { TerminalCalls, TerminalTopics } from './protocol';

// A terminal's output is gone once its shell is, so it isn't saved.
const socket = extensionSocket<TerminalCalls, TerminalTopics>('terminals', {
  unsaved: ['output'],
});

export const useTerminals = () => socket.useTopic('list', () => ({}));

export const useTerminalOutput = (id: () => string) =>
  socket.useTopic('output', () => ({ id: id() }));

export const createTerminal = (ref: WorkspaceRef, command?: string) =>
  socket.request('create', { ...ref, command });

export const terminalInput = (id: string, data: string) =>
  socket.request('input', { id, data });

export const resizeTerminal = (id: string, cols: number, rows: number) =>
  socket.request('resize', { id, cols, rows });

export const stopTerminal = (id: string) => socket.request('stop', { id });

export const restartTerminal = (id: string) =>
  socket.request('restart', { id });

export const removeTerminal = (id: string) => socket.request('remove', { id });

export const terminalHref = (id: string) =>
  extensionHref('terminals', encodeURIComponent(id));
