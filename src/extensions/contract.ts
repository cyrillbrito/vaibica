// The extension contract (docs/extensions.md). An extension is a manifest
// both sides read without running its code, a server half, and a client
// half. Off means its halves never register: its Durable extensions aren't
// installed, and its client's lazy imports never run.
//
// Pieces marked provisional were shaped by one extension alone. The next
// extension that needs something close should reshape them, not build
// around them.
import type { Op } from '@earendil-works/chord/delta';
import type { Extension } from '@earendil-works/pi-durable';
import type { JSX } from '@solidjs/web';
import type { Accessor, Component } from 'solid-js';
import type { Keys } from '../components/CommandPalette';
import type { MenuEntry } from '../components/ui/ContextMenu';
import type { AgentId } from '#lib/agents';
import type { WorkspaceRef } from '#lib/protocol';
import type { ToolCall } from '#lib/transcript';

export interface Manifest {
  id: string;
  title: string;
  /** One line for Settings. */
  about: string;
  /** Whether it's on before the user switches it. */
  on: boolean;
  /** What core does with its tools' calls, by tool name. */
  tools?: Record<string, ToolTraits>;
  /** What Settings shows under its switch, by key; its server reads them. */
  settings?: Record<string, Setting>;
}

/**
 * Provisional, shaped by web search's key. A secret is saved apart from
 * settings.json, in auth.json under its key, which is unique across Bica,
 * and the browser only learns whether it's set.
 */
export interface Setting {
  type: 'secret';
  label: string;
  /** Where to get one. */
  link?: { label: string; url: string };
}

/** Provisional. */
export interface ToolTraits {
  /**
   * The call ends the run until the user answers, while the extension is on:
   * the session reads as waiting, the call gets a row of its own, and the
   * next prompt folds into that row as the answer.
   */
  awaitsAnswer?: boolean;
  /** The browser gets the arguments whole, since the row is drawn from them. */
  wholeArgs?: boolean;
}

/** One tool's line in the prompt's tool list, and its rules. */
export interface ToolGuide {
  tools: string[];
  line: string;
  rules?: string[];
}

/** The requests an extension answers, by name: what each takes and returns. */
export type CallMap = Record<string, { args: any; result: any }>;
/** The topics an extension serves, by name: their params and value. */
export type TopicMap = Record<string, { params: any; value: any }>;

export type CallHandlers<C extends CallMap> = {
  [K in keyof C]: (args: C[K]['args']) => Promise<C[K]['result']>;
};

/** Where a topic sends: whole values, or its own changes to the last one. */
export interface TopicSink<V> {
  snapshot: (value: V) => void;
  changes: (ops: readonly Op[]) => void;
}

export type TopicHandlers<T extends TopicMap> = {
  [K in keyof T]: (
    params: T[K]['params'],
    sink: TopicSink<T[K]['value']>,
  ) => Promise<() => void>;
};

/**
 * Provisional, shaped by terminals: core's events an extension acts on, while
 * it's on. Named after core's own concepts, so any extension can use them.
 * A hook that throws is logged and skipped.
 */
export interface ServerHooks {
  /** A worktree was made for new work, before its session starts. */
  worktreeCreated?: (workspace: WorkspaceRef) => Promise<void>;
  /** A worktree is about to be removed: its folder is still there. */
  beforeWorktreeRemove?: (workspace: WorkspaceRef) => Promise<void>;
  /** A session was archived. */
  sessionArchived?: (id: string) => Promise<void>;
}

export interface ServerExtension {
  manifest: Manifest;
  /** Installed in Pi Durable's registry while it's on. */
  durable: Extension[];
  /**
   * Which sessions select it, by the agent they run as: all of `durable` or
   * none, or the ones listed. Absent: all, for every agent.
   */
  appliesTo?: (agent: AgentId) => boolean | readonly Extension[];
  /** Shown only in sessions that have the tools. */
  guide?: ToolGuide[];
  /** Provisional: what a session waiting on its call asks, for other agents. */
  waitingOn?: (call: { name: string; args: Record<string, unknown> }) => string;
  hooks?: ServerHooks;
  /**
   * Provisional: what runs in a workspace, a line each, for the agents'
   * `list`. `session` is the one asking.
   */
  inWorkspace?: (cwd: string, session: string) => string[];
  /** Requests the browser sends as `ext:<id>/<name>`. */
  calls?: CallHandlers<any>;
  /**
   * Calls that run again when re-sent after a lost reply, instead of
   * answering from the first run: reads, and input too frequent to remember.
   */
  reads?: readonly string[];
  /** Topics the browser watches as `ext:<id>/<name>`. */
  topics?: TopicHandlers<any>;
}

/** What core passes a tool row: the call, and the answer if it awaits one. */
export interface ToolRowProps {
  call: ToolCall;
  /** The session waits on this call's answer. */
  open: boolean;
  /** The prompt that answered it. */
  answer?: string;
  onAnswer: (text: string) => Promise<unknown>;
}

/** One row an extension lists in a workspace's group in the sidebar. */
export interface WorkspaceRow {
  /** Unique across the extension's rows; its row component gets it. */
  id: string;
  projectId: string;
  cwd: string;
}

/** Where a command runs: what the page shows, and a way to move. */
export interface CommandContext {
  /** The workspace the current page is about, if any, and its name. */
  workspace: WorkspaceRef | undefined;
  workspaceName: string | undefined;
  navigate: (href: string) => void;
}

/**
 * Provisional: a command by id, like VS Code's and Obsidian's. ⌘K lists the
 * ones that apply under Actions, and `runCommand` runs one by id.
 */
export interface Command {
  /** `<extension id>.<name>`, unique across Bica. */
  id: string;
  title: string;
  /** Muted text after the title, searched too. */
  hint?: (context: CommandContext) => string | undefined;
  /** Other words it should be found by. */
  words?: string;
  icon?: () => JSX.Element;
  keys?: Keys;
  /** Whether it applies now. Absent: always. */
  when?: (context: CommandContext) => boolean;
  run: (context: CommandContext) => void | Promise<unknown>;
}

/**
 * Provisional: a page in the centre, at `/e/<extension id>/<path>`. Core
 * owns that one route and draws the page whose path matches.
 */
export interface ExtensionPage {
  /** Within the extension's prefix, with `:name` segments: `:id`. */
  path: string;
  load: () => Promise<{
    default: Component<{ params: Record<string, string> }>;
  }>;
}

/** Something ⌘K finds while you type, like a session: a place to go. */
export interface PalettePlace {
  id: string;
  label: string;
  hint?: string;
  icon?: () => JSX.Element;
  href: string;
}

// The UI slots past `transcript.tool` are provisional, shaped by terminals
// alone. Their `use` hooks run in the slot's own component scope, so they
// may read a topic or call `useNavigate`, and run again when the switches
// change.
export type Slot =
  | {
      slot: 'transcript.tool';
      tool: string;
      load: () => Promise<{ default: Component<ToolRowProps> }>;
    }
  /** Rows in a workspace's group in the sidebar, above its sessions. */
  | {
      slot: 'sidebar.workspace';
      use: () => {
        /** A workspace with rows stays out of Parked. */
        rows: Accessor<readonly WorkspaceRow[]>;
        /** Entries for a workspace's menu, after New session here. */
        menu?: (workspace: WorkspaceRef) => MenuEntry[];
      };
      /** Draws one row, inside the sidebar's list item. */
      load: () => Promise<{ default: Component<{ id: string }> }>;
    }
  /** Places ⌘K finds while you type, after sessions and workspaces. */
  | { slot: 'palette.search'; use: () => Accessor<readonly PalettePlace[]> };

export type SlotOf<K extends Slot['slot']> = Extract<Slot, { slot: K }>;

/**
 * How the generic tool row draws a call, on or off, so past calls keep
 * their look. Provisional, shaped by web search.
 */
export interface ToolLook {
  /** Short enough for the row's name column. */
  label?: string;
  icon?: () => JSX.Element;
}

export interface ClientExtension {
  manifest: Manifest;
  slots?: Slot[];
  /** By tool name. */
  tools?: Record<string, ToolLook>;
  pages?: ExtensionPage[];
  commands?: Command[];
}

export const defineServerExtension = (e: ServerExtension) => e;
export const defineClientExtension = (e: ClientExtension) => e;
