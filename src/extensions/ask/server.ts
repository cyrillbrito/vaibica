import 'server-only';
import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { defineServerExtension } from '../contract';
import { ask as manifest, questionsOf } from './meta';

/**
 * Asks the user and ends the run; the answer arrives as the next prompt.
 * Nothing blocks while waiting, so a question survives restarts and can be
 * answered hours later from another device. The browser draws the options
 * from the call's arguments (./AskCard.tsx).
 */
const ask = defineTool({
  name: 'ask',
  description:
    'Ask the user one to four multiple-choice questions, then stop and wait for the answer, which arrives as the user\'s next message. Use it for decisions that are genuinely the user\'s (what to build, which approach, scope), not for facts you can look up. Call it alone, as the last thing in your turn. Put your recommended option first and end its label with " (Recommended)". The user can pick, write their own answer or a note per question, or skip a question (it comes back as "(skipped)": decide it yourself or ask again later).',
  parameters: Type.Object({
    questions: Type.Array(
      Type.Object({
        question: Type.String({
          description: 'The full question, ending with a question mark',
        }),
        header: Type.String({
          description: 'A very short label for it, at most 12 characters',
        }),
        options: Type.Array(
          Type.Object({
            label: Type.String({ description: '1 to 5 words' }),
            description: Type.Optional(
              Type.String({ description: 'What choosing it means' }),
            ),
          }),
          { minItems: 2, maxItems: 4 },
        ),
        multiSelect: Type.Optional(
          Type.Boolean({ description: 'Allow picking several options' }),
        ),
      }),
      { minItems: 1, maxItems: 4 },
    ),
  }),
  replay: 'safe',
  callers: ['model'],
  async execute() {
    return {
      output: [
        {
          type: 'text',
          text: "Shown to the user. Their answer arrives as the user's next message.",
        },
      ],
      control: { terminate: true },
    };
  },
});

// The name is stored in sessions' extension lists, so it stays.
const AskTool = defineExtension({ name: 'ask', tools: [ask] });

export default defineServerExtension({
  manifest,
  durable: [AskTool],
  // Nobody is awake to answer a night run.
  appliesTo: (profile) => profile !== 'night',
  guide: [
    { tools: ['ask'], line: 'Put multiple-choice questions to the user' },
  ],
  waitingOn: ({ args }) =>
    questionsOf(args)
      .map(
        (q, i) =>
          `${i + 1}. ${q.question}\n${q.options
            .map(
              (o) =>
                `   - ${o.label}${o.description ? `: ${o.description}` : ''}`,
            )
            .join('\n')}`,
      )
      .join('\n'),
});
