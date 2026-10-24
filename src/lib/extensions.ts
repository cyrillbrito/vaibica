import { createMemo, lazy, type Accessor, type Component } from 'solid-js';

import { CLIENT_EXTENSIONS } from '#extensions/client';
import type { Slot, SlotOf } from '#extensions/contract';
import { awaitsAnswer, enabledIds } from '#extensions/manifests';
import type { Calls, ExtensionState } from './protocol';
import { request, useTopicWhenReady } from './socket';

// The browser's half of the extension switch (src/server/extensions.ts).
// Until the `extensions` topic arrives, each one is as its manifest says.

export const useExtensions = () => useTopicWhenReady('extensions', () => ({}));

/** Switches an extension, or saves its settings; null removes a setting. */
export const updateExtension = (change: Calls['extension.update']['args']) =>
  request('extension.update', change);

const onIds = (list: ExtensionState[] | undefined) =>
  list
    ? new Set(list.filter((e) => e.on).map((e) => e.id))
    : enabledIds(undefined);

/** The ids of the extensions that are on. */
export function useEnabled() {
  const list = useExtensions();
  return createMemo(() => onIds(list()), {
    name: 'enabledExtensions',
    // Setting changes don't rebuild transcripts.
    equals: (a, b) => a.size === b.size && [...a].every((id) => b.has(id)),
  });
}

/** Tools whose calls wait on the user, for the transcript and the status. */
export function useAwaits() {
  const enabled = useEnabled();
  return createMemo(() => awaitsAnswer(enabled()), { name: 'awaitsAnswer' });
}

/** The row an extension that is on draws for calls to `tool`, if any. */
export function toolRow(enabled: ReadonlySet<string>, tool: string) {
  for (const e of CLIENT_EXTENSIONS) {
    if (!enabled.has(e.manifest.id)) continue;
    const slot = e.slots?.find(
      (s): s is SlotOf<'transcript.tool'> =>
        s.slot === 'transcript.tool' && s.tool === tool,
    );
    if (slot) return slotComponent(slot.load);
  }
}

/** How the generic row draws calls to `tool`, on or off. */
export const toolLook = (tool: string) =>
  CLIENT_EXTENSIONS.find((e) => e.tools?.[tool])?.tools?.[tool];

const slotsOf = <K extends Slot['slot']>(kind: K) =>
  CLIENT_EXTENSIONS.flatMap((e) =>
    (e.slots ?? [])
      .filter((s): s is SlotOf<K> => s.slot === kind)
      .map((slot) => ({ id: e.manifest.id, slot })),
  );

/**
 * Runs `use` for each slot of `kind` whose extension is on, in the caller's
 * scope, and again when the switches change.
 */
export function useSlots<K extends Slot['slot'], R>(
  kind: K,
  use: (slot: SlotOf<K>, extension: string) => R,
): Accessor<R[]> {
  const enabled = useEnabled();
  // The defaults until the switches arrive would subscribe to an extension
  // that's off, and the server would refuse it.
  const list = useExtensions();
  const known = createMemo(() => list() !== undefined, {
    name: 'switchesKnown',
  });
  return createMemo(
    () =>
      (known() ? slotsOf(kind) : [])
        .filter((s) => enabled().has(s.id))
        .map((s) => use(s.slot, s.id)),
    { name: `slots:${kind}` },
  );
}

/**
 * The page an extension that is on draws at `/e/<id>/<path>`, and the
 * params its path pattern took from it.
 */
export function extensionPage(
  enabled: ReadonlySet<string>,
  id: string,
  path: string,
) {
  const e = CLIENT_EXTENSIONS.find((e) => e.manifest.id === id);
  if (!e || !enabled.has(id)) return undefined;
  const parts = path.split('/').filter(Boolean);
  for (const page of e.pages ?? []) {
    const pattern = page.path.split('/').filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const fits = pattern.every((p, i) => {
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(parts[i]!);
      return p.startsWith(':') || p === parts[i];
    });
    if (fits) return { Page: slotComponent(page.load), params };
  }
}

/** The address of an extension's page. */
export const extensionHref = (id: string, path: string) =>
  `/e/${id}/${path.replace(/^\//, '')}`;

/** The commands of the extensions that are on, in manifest order. */
export function useCommands() {
  const enabled = useEnabled();
  return createMemo(
    () =>
      CLIENT_EXTENSIONS.filter((e) => enabled().has(e.manifest.id)).flatMap(
        (e) => e.commands ?? [],
      ),
    { name: 'extensionCommands' },
  );
}

const components = new Map<() => Promise<unknown>, Component<any>>();

/** One lazy component per slot, so its import runs once, and only when drawn. */
export function slotComponent<P extends Record<string, any>>(
  load: () => Promise<{ default: Component<P> }>,
): Component<P> {
  let c = components.get(load);
  if (!c) components.set(load, (c = lazy(load)));
  return c;
}
