import type { WorkspaceRef } from './protocol';
import { request, useTopic } from './socket';

export const useTerminals = () => useTopic('terminals', () => ({}));

export const useTerminalOutput = (id: () => string) =>
  useTopic('terminal', () => ({ id: id() }));

export const createTerminal = (ref: WorkspaceRef, command?: string) =>
  request('terminal.create', { ...ref, command });

export const terminalInput = (id: string, data: string) =>
  request('terminal.input', { id, data });

export const resizeTerminal = (id: string, cols: number, rows: number) =>
  request('terminal.resize', { id, cols, rows });

export const stopTerminal = (id: string) => request('terminal.stop', { id });

export const restartTerminal = (id: string) =>
  request('terminal.restart', { id });

export const removeTerminal = (id: string) =>
  request('terminal.remove', { id });
