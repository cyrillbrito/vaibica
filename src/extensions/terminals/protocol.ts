// The terminals' requests and topics, on the wire as `ext:terminals/<name>`
// (docs/extensions.md). Types only, shared by both halves. The maps are
// types, not interfaces, so they fit the contract's CallMap and TopicMap.
import type { WorkspaceRef } from '#lib/protocol';

/** A shell in a workspace, maybe running a command (docs/terminals.md). */
export interface TerminalInfo {
  id: string;
  projectId: string;
  cwd: string;
  title: string;
  // The command it runs first, again on restart; null: none.
  command: string | null;
  // The shell itself.
  status: 'running' | 'exited';
  exitCode: number | null;
  // A command runs at its prompt; null: not known (no shell integration).
  busy: boolean | null;
  // The last finished command's exit code.
  lastExit: number | null;
  // The session whose agent started it; null: started by the user.
  startedBy: string | null;
  createdAt: number;
}

/** A terminal's output, raw (escape codes and all), capped at the front. */
export interface TerminalOutput {
  // Bumped on restart: start a clean screen.
  run: number;
  // Characters dropped from the front so far.
  start: number;
  output: string;
}

export type TerminalCalls = {
  // Absent command: an interactive shell. Its id.
  create: {
    args: WorkspaceRef & { command?: string; title?: string };
    result: string;
  };
  // Keystrokes, as the terminal encodes them.
  input: { args: { id: string; data: string }; result: null };
  resize: { args: { id: string; cols: number; rows: number }; result: null };
  stop: { args: { id: string }; result: null };
  restart: { args: { id: string }; result: null };
  // Stops it if needed and drops it from the list.
  remove: { args: { id: string }; result: null };
};

export type TerminalTopics = {
  list: { params: Record<string, never>; value: TerminalInfo[] };
  // null: no such terminal (closed, or the server restarted).
  output: { params: { id: string }; value: TerminalOutput | null };
};
