import type { ModelChoice } from '@bica/shared/protocol';
import { defaultChoice } from '../models/models';
import { checkChoice, models } from '../models/registry';
import type { Agent } from './common';

const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** `choice` at the agent's least effort or above. */
export function atLeast(agent: Agent, choice: ModelChoice): ModelChoice {
  return agent.minEffort &&
    LEVELS.indexOf(choice.thinkingLevel) < LEVELS.indexOf(agent.minEffort)
    ? { ...choice, thinkingLevel: agent.minEffort }
    : choice;
}

/**
 * The model a session of `agent` starts on: `preferred`, such as a setting,
 * else the agent's own model, the first a sign-in reaches; else the default
 * model, at the agent's effort.
 */
export async function agentChoice(
  agent: Agent,
  preferred?: ModelChoice | null,
): Promise<ModelChoice> {
  const own = agent.model && {
    model: agent.model,
    thinkingLevel: agent.effort ?? 'medium',
  };
  if (preferred || own) {
    const available = await models.getAvailable();
    for (const c of [preferred, own])
      if (
        c &&
        available.some(
          (m) => m.provider === c.model.provider && m.id === c.model.modelId,
        )
      )
        return checkChoice(atLeast(agent, c));
  }
  const base = await defaultChoice();
  // Unchecked unless the agent sets its effort: an unknown saved model shows
  // in Settings instead of failing here.
  return agent.effort
    ? checkChoice(atLeast(agent, { ...base, thinkingLevel: agent.effort }))
    : atLeast(agent, base);
}
