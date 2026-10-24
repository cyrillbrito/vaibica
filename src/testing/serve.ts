// Bica in a process of its own, for tests that kill it:
//   bun --preload ./src/testing/preload.ts src/testing/serve.ts <root> <hang | answer text>
// Prints its port once it listens.
import { fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';

import { startBica } from './bica';

const [root, mode, text = ''] = process.argv.slice(2);
const bica = await startBica({ root });
if (mode === 'hang') bica.hold();
else bica.reply(fauxAssistantMessage(text));
console.log(`port ${bica.port}`);
