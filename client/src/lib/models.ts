import type { ConversationView } from '@earendil-works/pi-durable';
import { createSignal } from 'solid-js';

import type {
  ModelCatalog,
  ModelChoice,
  ModelSettings,
} from '@bica/shared/protocol';
import { request, useTopic } from './socket';

export const useModels = () => useTopic('models', () => ({}));

// The open session's model, set by its page; undefined: no session open.
const [openModel, setOpenModel] = createSignal<
  ModelChoice['model'] | undefined
>(undefined, { name: 'openModel' });
export { openModel, setOpenModel };

export const updateSettings = (change: Partial<ModelSettings>) =>
  request('settings.update', change);

export const modelKey = (provider: string, modelId: string) =>
  `${provider}/${modelId}`;

type Named = { provider: string; id: string; name: string };

// "Claude Opus 4.5" → Opus, "GPT-5.1 Codex mini" → Codex mini, "Qwen: Qwen3
// Coder" → Qwen3 Coder: the vendor, version numbers, and asides go.
function split(name: string) {
  const version = name.match(/\b\d+(?:\.\d+)*\b(?![\w-])/)?.[0] ?? '';
  const short = name
    .replace(/^[^:]+:\s*/, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/^Claude\s+/i, '')
    .replace(/^GPT-[\d.]+\s+(?=\S)/i, '')
    .replace(/(^|\s)\d+(?:\.\d+)*(?=\s|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { short: short || name, version };
}

const newer = (a: string, b: string) => {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/**
 * The name to show where room is short, such as "Opus". Only the newest
 * version among `models` gets it; older ones keep their full name, so the
 * short name always means the latest.
 */
export function shortName(model: Named, models: Named[]) {
  const own = split(model.name);
  const beaten = models.some((m) => {
    const other = split(m.name);
    return other.short === own.short && newer(other.version, own.version);
  });
  return beaten ? model.name : own.short;
}

/** The models a picker offers: the enabled ones (all if none), plus `current`. */
export function pickable(catalog: ModelCatalog, current?: ModelChoice) {
  const enabled = new Set(catalog.settings.enabled);
  return catalog.models.filter(
    (m) =>
      !enabled.size ||
      enabled.has(modelKey(m.provider, m.id)) ||
      (m.provider === current?.model.provider &&
        m.id === current.model.modelId),
  );
}

/** The model and effort a session runs with, from its `pi.agent` document. */
export function sessionChoice(view: ConversationView): ModelChoice | undefined {
  const agent = view.docs['pi.agent'] as Partial<ModelChoice> | undefined;
  if (!agent?.model) return undefined;
  // Pi Durable's default when a session never set one.
  return { model: agent.model, thinkingLevel: agent.thinkingLevel ?? 'off' };
}
