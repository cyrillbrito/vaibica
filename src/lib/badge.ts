// The app icon's badge, and whether this page has focus.
import { createEffect, createSignal, type Accessor } from 'solid-js';

import type { SessionStatus, SessionSummary } from './protocol';

// Focused, not just visible: a tab behind another window, or a laptop left
// open on a session, isn't someone looking.
const isFocused = () =>
  document.visibilityState === 'visible' && document.hasFocus();
const [focused, setFocused] = createSignal(isFocused(), {
  name: 'pageFocused',
});
export { focused as pageFocused };

const update = () => setFocused(isFocused());
addEventListener('focus', update);
addEventListener('blur', update);
document.addEventListener('visibilitychange', update);

// What counts on the icon: the rows the sidebar marks as needing you.
const NEEDS_YOU: ReadonlySet<SessionStatus> = new Set(['waiting', 'done']);

/** Run once, in the sidebar: keeps the icon's badge on the sessions that need you. */
export function useBadge(sessions: Accessor<SessionSummary[]>) {
  createEffect(
    () =>
      sessions().filter((s) => !s.archivedAt && NEEDS_YOU.has(s.status)).length,
    (count) => {
      if ('setAppBadge' in navigator)
        (count
          ? navigator.setAppBadge(count)
          : navigator.clearAppBadge()
        ).catch(() => {});
    },
    { name: 'appBadge' },
  );
}
