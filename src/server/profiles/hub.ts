import 'server-only';
import type { ModelChoice } from '#lib/protocol';
import { checkChoice, modelSettings, models } from '#server/providers';

/** The hub's folder from Settings, or null before one is picked. */
export const hubFolder = async () => (await modelSettings()).hubFolder;

// The hub's default (docs/explorations/hub-model.md): smart enough to turn
// dictation into good prompts at low effort, and direct, since the CLI proxy
// adds seconds to every request.
const HUB_MODEL: ModelChoice = {
  model: { provider: 'anthropic', modelId: 'claude-sonnet-5-5' },
  thinkingLevel: 'low',
};

/**
 * The hub's model: the setting, else Sonnet through Anthropic, else the
 * default model at low effort when Anthropic has no key.
 */
export async function hubChoice(): Promise<ModelChoice> {
  const { hubModel, model } = await modelSettings();
  const available = await models.getAvailable();
  const reachable = (c: ModelChoice) =>
    available.some(
      (m) => m.provider === c.model.provider && m.id === c.model.modelId,
    );
  for (const c of [hubModel, HUB_MODEL])
    if (c && reachable(c)) return checkChoice(c);
  return checkChoice({ model, thinkingLevel: 'low' });
}
