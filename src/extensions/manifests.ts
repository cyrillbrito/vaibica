import { ask } from './ask/meta';
import type { Manifest } from './contract';

/**
 * Every built-in extension. The order is the order their parts take in a
 * session's extension list, so it stays fixed for the prompt cache.
 */
export const MANIFESTS = [ask] as const satisfies readonly Manifest[];

export type ExtensionId = (typeof MANIFESTS)[number]['id'];

/** The ids of the extensions that are on: the saved switch, else the default. */
export const enabledIds = (saved: Record<string, boolean> | undefined) =>
  new Set<string>(
    MANIFESTS.filter((m) => saved?.[m.id] ?? m.on).map((m) => m.id),
  );

const traits = (m: Manifest, tool: string) => m.tools?.[tool];

/** Whether a call to `tool` waits on the user's answer, with `enabled` on. */
export const awaitsAnswer =
  (enabled: ReadonlySet<string>) =>
  (tool: string): boolean =>
    MANIFESTS.some((m) => enabled.has(m.id) && !!traits(m, tool)?.awaitsAnswer);

// On or off: entries are projected once, and a call slimmed while its
// extension was off would stay empty once it's back on.
export const wholeArgs = (tool: string) =>
  MANIFESTS.some((m) => !!traits(m, tool)?.wholeArgs);

/**
 * A side's halves in manifest order. Keyed by id, so a missing or extra
 * half fails the type check instead of dropping silently.
 */
export function inOrder<T extends { manifest: Manifest }>(
  halves: Record<ExtensionId, T>,
): readonly T[] {
  return MANIFESTS.map((m) => {
    const half = halves[m.id];
    if (half.manifest.id !== m.id)
      throw new Error(`Extension ${m.id} has ${half.manifest.id}'s manifest`);
    return half;
  });
}
