import { createSignal, untrack } from 'solid-js';

export type Motion = 'system' | 'full' | 'reduced';

// Per device, like the theme. Lets the browser animate even when macOS has
// reduced motion on (most browsers can't override it themselves).
const KEY = 'motion';

// Document.tsx imports the boot script, and the build renders it under Bun.
const read = (): Motion => {
  if (typeof localStorage === 'undefined') return 'system';
  const m = localStorage.getItem(KEY);
  return m === 'full' || m === 'reduced' ? m : 'system';
};

const [motion, set] = createSignal<Motion>(read(), { name: 'motion' });
export { motion };

export function setMotion(m: Motion) {
  set(m);
  if (m === 'system') {
    localStorage.removeItem(KEY);
    delete document.documentElement.dataset.motion;
  } else {
    localStorage.setItem(KEY, m);
    document.documentElement.dataset.motion = m;
  }
}

/** For JS animations; CSS uses the `motion-safe` / `motion-reduce` variants. */
export function reducedMotion() {
  // Asked at the moment of animating, often in an effect's callback: a
  // one-time read, and Solid's dev warning for it costs ~100ms on a phone.
  const m = untrack(motion);
  if (m !== 'system') return m === 'reduced';
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Runs inline in <head> before first paint. */
export const motionBootScript = `try{var m=localStorage.getItem('${KEY}');if(m==='full'||m==='reduced')document.documentElement.dataset.motion=m}catch(e){}`;
