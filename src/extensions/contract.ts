// The extension contract (docs/extensions.md). An extension is a manifest
// both sides read without running its code, a server half, and a client
// half. Off means its halves never register: its Durable extensions aren't
// installed, and its client's lazy imports never run.
//
// Pieces marked provisional were shaped by one extension alone. The next
// extension that needs something close should reshape them, not build
// around them.
import type { Extension } from '@earendil-works/pi-durable';
import type { JSX } from '@solidjs/web';
import type { Component } from 'solid-js';
import type { AgentId } from '#lib/agents';
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

export interface ServerExtension {
  manifest: Manifest;
  /** Installed in Pi Durable's registry while it's on. */
  durable: Extension[];
  /** Which sessions select it, by the agent they run as. Absent: all. */
  appliesTo?: (agent: AgentId) => boolean;
  /** Shown only in sessions that have the tools. */
  guide?: ToolGuide[];
  /** Provisional: what a session waiting on its call asks, for other agents. */
  waitingOn?: (call: { name: string; args: Record<string, unknown> }) => string;
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

export type Slot = {
  slot: 'transcript.tool';
  tool: string;
  load: () => Promise<{ default: Component<ToolRowProps> }>;
};

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
}

export const defineServerExtension = (e: ServerExtension) => e;
export const defineClientExtension = (e: ClientExtension) => e;
