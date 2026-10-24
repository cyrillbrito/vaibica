import { createMemo, lazy, type Component } from 'solid-js';

import { CLIENT_EXTENSIONS } from '#extensions/client';
import type { ToolRowProps } from '#extensions/contract';
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

// One lazy component per slot, so its import runs once, and only when drawn.
const rows = new Map<() => Promise<unknown>, Component<ToolRowProps>>();

/** The row an extension that is on draws for calls to `tool`, if any. */
export function toolRow(enabled: ReadonlySet<string>, tool: string) {
  for (const e of CLIENT_EXTENSIONS) {
    if (!enabled.has(e.manifest.id)) continue;
    const slot = e.slots?.find(
      (s) => s.slot === 'transcript.tool' && s.tool === tool,
    );
    if (!slot) continue;
    let row = rows.get(slot.load);
    if (!row) rows.set(slot.load, (row = lazy(slot.load)));
    return row;
  }
}

/** How the generic row draws calls to `tool`, on or off. */
export const toolLook = (tool: string) =>
  CLIENT_EXTENSIONS.find((e) => e.tools?.[tool])?.tools?.[tool];
