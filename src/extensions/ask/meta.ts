import type { Manifest } from '../contract';

export const ask = {
  id: 'ask',
  title: 'Ask',
  about:
    'The agent can put multiple-choice questions to you and wait for the answer. Night runs never get it.',
  on: true,
  tools: { ask: { awaitsAnswer: true, wholeArgs: true } },
} as const satisfies Manifest;

/** One question of the `ask` tool (./server.ts). */
export interface Question {
  question: string;
  header: string;
  options: { label: string; description?: string }[];
  multiSelect?: boolean;
}

/** The arguments as they stream in: any field may still be missing. */
export function questionsOf(args: Record<string, unknown>): Question[] {
  const list = Array.isArray(args.questions) ? args.questions : [];
  return list.map((q: Partial<Question> | undefined) => ({
    question: typeof q?.question === 'string' ? q.question : '',
    header: typeof q?.header === 'string' ? q.header : '',
    options: (Array.isArray(q?.options) ? q.options : []).filter(
      (o) => typeof o?.label === 'string',
    ),
    multiSelect: q?.multiSelect === true,
  }));
}
