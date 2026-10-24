import 'server-only';
import type { Registry } from '@earendil-works/pi-durable';

import { SERVER_EXTENSIONS } from '#extensions/server';
import { awaitsAnswer, enabledIds } from '#extensions/manifests';
import { timeTools } from '#server/agent/tools/tool-time';
import { modelSettings } from '#server/providers';

// Which built-in extensions are on (docs/explorations/extensibility.md). The
// switch lives in settings.json. Sessions select every extension that
// applies to them, on or off (profiles/registry.ts): only the registry holds
// the ones that are on, and Durable skips names it hasn't installed, so a
// switch reaches every session, stored lists too, from its next request.

let enabled = enabledIds(undefined);
let registry: Registry | undefined;
const installed = new Set<string>();

const sync = () => {
  if (!registry) return;
  for (const e of SERVER_EXTENSIONS) {
    const on = enabled.has(e.manifest.id);
    if (on === installed.has(e.manifest.id)) continue;
    for (const d of e.durable)
      if (on) registry.install(timeTools(d));
      else registry.uninstall(d);
    if (on) installed.add(e.manifest.id);
    else installed.delete(e.manifest.id);
  }
};

/** Re-reads the switches after settings change. */
export async function applyExtensions() {
  enabled = enabledIds((await modelSettings()).extensions);
  sync();
}

/** Installs the extensions that are on, and keeps the registry for switches. */
export async function installExtensions(into: Registry) {
  registry = into;
  await applyExtensions();
}

/** Whether a call to `tool` leaves the session waiting on the user. */
export const awaits = (tool: string) => awaitsAnswer(enabled)(tool);

/** What a session waiting on `call` asks, in words for other agents. */
export const waitingOn = (call: {
  name: string;
  args: Record<string, unknown>;
}) =>
  SERVER_EXTENSIONS.find(
    (e) => enabled.has(e.manifest.id) && e.manifest.tools?.[call.name],
  )?.waitingOn?.(call);
