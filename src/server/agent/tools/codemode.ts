import 'server-only';
import { CodemodeSandbox, loadQuickJSWasm } from '@earendil-works/pi-codemode';
import type { ToolRegistration } from '@earendil-works/pi-durable';
import { createCodemodeExtension } from '@earendil-works/pi-durable/codemode';
import { withSummary } from './summary';

// Durable's codemode: scripts call the conversation's tools as nested calls
// and survive a restart. Tools that orchestrate or ask (session tools, list,
// ask) set `callers: ['model']`, so scripts can't reach them.
const extension = createCodemodeExtension({
  sandbox: new CodemodeSandbox({
    // A runaway script must not grow to wasm32's 4 GiB inside the server process.
    memoryLimitBytes: 256 * 1024 * 1024,
    // The `bica` binary embeds both, where codemode can't find them itself.
    ...(process.env.BICA_CODEMODE_WASM && {
      wasm: loadQuickJSWasm(process.env.BICA_CODEMODE_WASM),
      workerUrl: process.env.BICA_CODEMODE_WORKER,
    }),
  }),
});

export const Codemode = {
  ...extension,
  tools: extension.tools?.map((tool) => withSummary(tool as ToolRegistration)),
};
