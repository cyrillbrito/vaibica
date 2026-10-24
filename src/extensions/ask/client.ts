import { defineClientExtension } from '../contract';
import { ask as manifest } from './meta';

export default defineClientExtension({
  manifest,
  slots: [
    { slot: 'transcript.tool', tool: 'ask', load: () => import('./AskCard') },
  ],
});
