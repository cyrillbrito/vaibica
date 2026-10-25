import type { JsonObject } from '@earendil-works/pi-ai';

import { models } from './registry';
import { decisionModel } from './models';

/**
 * Yes or no questions about one state, answered by the decision model picked
 * in Settings: a real one (Jev, Clef, Luna Decisions) gives calibrated
 * probabilities in well under a second; a chat model, such as Haiku, answers
 * the same questions in JSON, slower, pricier, and only ever 0 or 1.
 */
export type Question = { instructions: string; yes: string; no: string };

// Jev answers questions independently against a shared state; batches keep a
// request under its limits. A chat model takes them all at once, since each
// call resends the whole state at chat prices.
const BATCH = 40;

const SYSTEM = `You are a decision model. Read the state and answer every question with true or false. Reply with one JSON object that maps each question id to true or false, and nothing else.`;

export const hasDecisionModel = () => !!decisionModel();

/** The probability of yes per question id; rejects when the model fails. */
export async function decide(
  state: JsonObject,
  questions: Record<string, Question>,
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const ref = decisionModel();
  if (!ref) throw new Error('No decision model set (Settings → Models)');
  const ids = Object.keys(questions);
  const classifier = models.getModelOfType(
    'classifier',
    ref.provider,
    ref.modelId,
  );
  if (classifier) {
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH)
      batches.push(ids.slice(i, i + BATCH));
    const results = await Promise.all(
      batches.map(async (batch) => {
        const result = await models.classify(
          classifier,
          {
            state,
            questions: Object.fromEntries(
              batch.map((id) => {
                const q = questions[id]!;
                return [
                  id,
                  {
                    type: 'bool' as const,
                    instructions: q.instructions,
                    criteria: { true: q.yes, false: q.no },
                  },
                ];
              }),
            ),
          },
          { signal },
        );
        if (result.stopReason !== 'stop')
          throw new Error(result.errorMessage ?? result.stopReason);
        return batch.flatMap((id) => {
          const a = result.answers[id];
          return a?.type === 'bool' ? [[id, a.probability] as const] : [];
        });
      }),
    );
    return Object.fromEntries(results.flat());
  }

  const chat = models.getModel(ref.provider, ref.modelId);
  if (!chat) throw new Error(`Unknown model ${ref.provider}/${ref.modelId}`);
  const reply = await models.completeSimple(
    chat,
    {
      systemPrompt: SYSTEM,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            state,
            questions: Object.fromEntries(
              ids.map((id) => {
                const q = questions[id]!;
                return [
                  id,
                  `${q.instructions} (true: ${q.yes}; false: ${q.no})`,
                ];
              }),
            ),
          }),
          timestamp: Date.now(),
        },
      ],
    },
    { maxTokens: 200 + ids.length * 12, signal },
  );
  if (reply.stopReason === 'error') throw new Error(reply.errorMessage);
  const text = reply.content
    .flatMap((part) => (part.type === 'text' ? part.text : []))
    .join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const answers = JSON.parse(json) as Record<string, unknown>;
  return Object.fromEntries(
    ids.flatMap((id) =>
      typeof answers[id] === 'boolean' ? [[id, answers[id] ? 1 : 0]] : [],
    ),
  );
}
