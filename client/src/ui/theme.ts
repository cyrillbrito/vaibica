import { createSignal } from 'solid-js';

export type Theme = 'system' | 'light' | 'dark';

// Per device, not a server setting: phone and laptop may want different ones.
const KEY = 'theme';
const BG = { light: '#fbfbfa', dark: '#111113' };

// Document.tsx imports the boot script, and the build renders it under Bun.
function read(): Theme {
  if (typeof localStorage === 'undefined') return 'system';
  const t = localStorage.getItem(KEY);
  return t === 'light' || t === 'dark' ? t : 'system';
}

const [theme, set] = createSignal<Theme>(read(), { name: 'theme' });
export { theme };

export function setTheme(t: Theme) {
  set(t);
  if (t === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, t);
  apply(t);
}

// Everything themes through `color-scheme` (our light-dark() tokens, Shiki,
// Pierre's shadow roots), so one attribute switches it all.
function apply(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    const own = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = BG[t === 'system' ? own : t];
  }
}

/** Runs inline in <head> before first paint, so a forced theme doesn't flash. */
export const themeBootScript = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;var c=t==='dark'?'${BG.dark}':'${BG.light}';document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c})}}catch(e){}`;
