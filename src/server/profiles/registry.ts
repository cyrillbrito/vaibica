import 'server-only';
import type { Context } from '@earendil-works/chord';
import {
  defineExtension,
  section,
  type Extension,
  type PromptInput,
} from '@earendil-works/pi-durable';
import { SERVER_EXTENSIONS } from '#extensions/server';
import type { ProfileId } from '#lib/profiles';
import { ToolSummary } from '#server/agent/tools/summary';
import { SessionDoc, profileOf } from '#server/sessions/session-doc';
import { assistant } from './assistant';
import { coding } from './coding';
import {
  HEAD_SECTIONS,
  TAIL_SECTIONS,
  type Profile,
  type SectionKey,
} from './common';
import { hub } from './hub';
import { night } from './night';

export { loadMemory } from './common';
export { hubChoice, hubFolder } from './hub';
export { nightChoice } from './night';

// Import profile files only here. sessions/tools.ts, which they import, comes
// back here through create.ts, so a profile loaded from elsewhere could read
// another one before it is set.
const PROFILES: Record<ProfileId, Profile> = { coding, assistant, night, hub };

/** Renders the section `key` of the session's profile, or nothing. */
const on = (key: SectionKey, options?: { tag: boolean }) =>
  section(
    key,
    async (input: PromptInput, context: Context) => {
      const meta = await input.read.snapshot(
        SessionDoc,
        input.conversationId,
        context,
      );
      const render = PROFILES[profileOf(meta)].sections[key];
      const text =
        typeof render === 'function'
          ? await render({
              tools: input.agent.tools.map((t) => t.name),
              cwd: input.agent.cwd ?? '',
              memory: meta?.memory || undefined,
              projects: meta?.projects || undefined,
            })
          : render;
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
 * The rest, after the tools: the folder's files, the profile's role, and the
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

/**
 * A profile's extensions, in a fixed order: the prompt, the profile's tools,
 * the built-in extensions that apply to it, then the folder's files and the
 * reply rules, which come last. Built-ins that are off stay in the list:
 * Durable skips what isn't installed (src/server/extensions.ts).
 */
const resolve = (id: ProfileId) => [
  BicaPrompt,
  ...PROFILES[id].tools,
  ...SERVER_EXTENSIONS.filter((e) => e.appliesTo?.(id) ?? true).flatMap(
    (e) => e.durable,
  ),
  BicaContext,
  ToolSummary,
];

/** What every session runs with unless its profile picks its own. */
export const DEFAULT_EXTENSIONS = resolve('coding');

/** What the harness always installs; built-ins install while they're on. */
export const CORE_EXTENSIONS = new Set([
  BicaPrompt,
  ...Object.values(PROFILES).flatMap((p) => p.tools),
  BicaContext,
  ToolSummary,
]);

export interface ServerProfile extends Profile {
  // null: DEFAULT_EXTENSIONS, for profiles that resolve to the same list, so
  // switching between them keeps following the host default.
  extensions: Extension[] | null;
}

const sameNames = (a: Extension[], b: Extension[]) =>
  a.length === b.length && a.every((e, i) => e.name === b[i]!.name);

const SERVER = Object.fromEntries(
  (Object.keys(PROFILES) as ProfileId[]).map((id) => [
    id,
    {
      ...PROFILES[id],
      extensions: sameNames(resolve(id), DEFAULT_EXTENSIONS)
        ? null
        : resolve(id),
    },
  ]),
) as Record<ProfileId, ServerProfile>;

export const serverProfile = (id: ProfileId) => SERVER[id];
