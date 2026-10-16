import type { ConversationView } from '@earendil-works/pi-durable';
import { createSignal } from 'solid-js';

import type { ModelCatalog, ModelChoice, ModelSettings } from './protocol';
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
