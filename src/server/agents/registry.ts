import 'server-only';
import type { Context } from '@earendil-works/chord';
import {
  defineExtension,
  section,
  type Extension,
  type PromptInput,
} from '@earendil-works/pi-durable';
import { SERVER_EXTENSIONS } from '#extensions/server';
import type { AgentId } from '#lib/agents';
import { Codemode } from '#server/agent/tools/codemode';
import { CodingTools, HubFileTools } from '#server/agent/tools/coding';
import { ToolSummary } from '#server/agent/tools/summary';
import { SessionDoc, agentIdOf } from '#server/sessions/session-doc';
import { HubSessionTools, SessionTools } from '#server/sessions/tools';
import { HubTerminalTools, TerminalTools } from '#server/terminals';
import { assistant } from './assistant';
import { coding } from './coding';
import {
  HEAD_SECTIONS,
  TAIL_SECTIONS,
  type Agent,
  type SectionInput,
  type SectionKey,
  type ToolPack,
} from './common';
import { hub } from './hub';
import { night } from './night';
import { skillsSection } from './skills';

const AGENTS: Record<AgentId, Agent> = { coding, assistant, night, hub };

// The extensions behind the names agents pick. Sessions store the names, so
// they stay as they are. sessions/tools.ts comes back here through
// create.ts: nothing it exports may be read while it loads.
const PACKS: Record<ToolPack, Extension> = {
  'coding-tools': CodingTools,
  'terminal-tools': TerminalTools,
  'session-tools': SessionTools,
  codemode: Codemode,
  'hub-file-tools': HubFileTools,
  'hub-session-tools': HubSessionTools,
  'hub-terminal-tools': HubTerminalTools,
};
for (const [name, pack] of Object.entries(PACKS))
  if (pack.name !== name)
    throw new Error(`Tool pack ${name} is named ${pack.name}`);

export const getAgent = (id: AgentId) => AGENTS[id];

/** The text of section `key` for a session of `agent`, or nothing. */
export async function renderSection(
  agent: Agent,
  key: SectionKey,
  input: SectionInput,
) {
  if (key === 'skills')
    return agent.skills ? skillsSection(input.cwd) : undefined;
  const render = agent.sections[key];
  return typeof render === 'function' ? render(input) : render;
}

/** Renders the section `key` of the session's agent, or nothing. */
const on = (key: SectionKey, options?: { tag: boolean }) =>
  section(
    key,
    async (input: PromptInput, context: Context) => {
      const meta = await input.read.snapshot(
        SessionDoc,
        input.conversationId,
        context,
      );
      const text = await renderSection(getAgent(agentIdOf(meta)), key, {
        tools: input.agent.tools.map((t) => t.name),
        cwd: input.agent.cwd ?? '',
        memory: meta?.memory || undefined,
        projects: meta?.projects || undefined,
      });
      return text ?? undefined;
    },
    options,
  );

/**
 * The instructions, as sections Pi Durable renders before every request, in
 * the order of the selected extensions: this one before the tools, so the
 * codemode section follows the tool list and rules.
 */
const BicaPrompt = defineExtension({
  name: 'bica-prompt',
  sections: HEAD_SECTIONS.map((key) =>
    on(key, key === 'preamble' ? { tag: false } : undefined),
  ),
});

/**
 * The rest, after the tools: the folder's files, the agent's role, and the
 * reply rules. Durable sends only the sections that changed, so AGENTS.md and
 * skill edits apply from the next request without breaking the prompt cache.
 * Memory and the hub's project list are copies kept in SessionDoc
 * (src/server/sessions/prompts.ts). The name predates the folder sections and
 * stays, since sessions store their extension list.
 */
const BicaContext = defineExtension({
  name: 'bica-replies',
  sections: TAIL_SECTIONS.map((key) => on(key)),
});

const packs = (a: Agent) => a.extensions.map((name) => PACKS[name]);

/**
 * An agent's extensions, in a fixed order: the prompt, the agent's tools,
 * the built-in extensions that apply to it, then the folder's files and the
 * reply rules, which come last. Built-ins that are off stay in the list:
 * Durable skips what isn't installed (src/server/extensions.ts).
 */
const resolve = (a: Agent) => [
  BicaPrompt,
  ...packs(a),
  ...SERVER_EXTENSIONS.filter((e) => e.appliesTo?.(a.id) ?? true).flatMap(
    (e) => e.durable,
  ),
  BicaContext,
  ToolSummary,
];

/** What every session runs with unless its agent picks its own. */
export const DEFAULT_EXTENSIONS = resolve(coding);

/** What the harness always installs; built-ins install while they're on. */
export const CORE_EXTENSIONS = new Set([
  BicaPrompt,
  ...Object.values(AGENTS).flatMap(packs),
  BicaContext,
  ToolSummary,
]);

const sameNames = (a: Extension[], b: Extension[]) =>
  a.length === b.length && a.every((e, i) => e.name === b[i]!.name);

// null: DEFAULT_EXTENSIONS, for agents that resolve to the same list, so
// switching between them keeps following the host default.
const SELECTIONS = Object.fromEntries(
  Object.values(AGENTS).map((a) => [
    a.id,
    sameNames(resolve(a), DEFAULT_EXTENSIONS) ? null : resolve(a),
  ]),
) as Record<AgentId, Extension[] | null>;

/** The extension list a session of `agent` stores, null for the default. */
export const selection = (agent: Agent) => SELECTIONS[agent.id];
