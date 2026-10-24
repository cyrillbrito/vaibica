import { createSignal } from 'solid-js';

// Per device, like the theme: a phone may want a tighter transcript.
const KEY = 'hideThinking';

const [hideThinking, set] = createSignal(localStorage.getItem(KEY) === '1', {
  name: 'hideThinking',
});
export { hideThinking };

export function setHideThinking(hide: boolean) {
  set(hide);
  if (hide) localStorage.setItem(KEY, '1');
  else localStorage.removeItem(KEY);
}
