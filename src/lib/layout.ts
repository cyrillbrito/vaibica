import { createSignal } from 'solid-js';

import type { AgentId } from './agents';

// Module-scope UI state: only written from client event handlers, so the
// server always renders the defaults.

// Wide screens: panels are columns the user can hide.
export const [sidebarHidden, setSidebarHidden] = createSignal(false);
export const [sidePanelHidden, setSidePanelHidden] = createSignal(false);
// The open session has no files and changes panel.
export const [noPanels, setNoPanels] = createSignal(false);
// The hub has no shell and works in no project (docs/hub.md), so its
// sessions show no Git, files, or terminal panels.
export const hasPanels = (agent: AgentId) => agent !== 'hub';

// Column widths in px, dragged by the user. The signals hold what the user
// asked for; the exported `sidebarW` / `sidePanelW` are what is rendered, always
// within the column's bounds and what fits the window.
export const sidebarWidth = { min: 200, initial: 256, max: 420 };
export const sidePanelWidth = { min: 280, initial: 360, max: 720 };
const [sidebarWanted, setSidebarW] = createSignal(sidebarWidth.initial);
const [sidePanelWanted, setSidePanelW] = createSignal(sidePanelWidth.initial);
export { setSidebarW, setSidePanelW };

// Space the centre column keeps no matter how wide the side columns get.
const MIN_MAIN = 400;
// Keep in sync with the md/xl breakpoints used in App.tsx.
const MD = 768;
const XL = 1280;

// Window width. Infinite until mounted, so the server and first client render
// use the plain bounds (no hydration mismatch); `trackViewport` fills it in.
const [viewport, setViewport] = createSignal(Infinity);

/** Follow the window width so columns can't outgrow it. Returns a cleanup. */
export function trackViewport() {
  const update = () => setViewport(document.documentElement.clientWidth);
  update();
  addEventListener('resize', update);
  return () => removeEventListener('resize', update);
}

const within = (w: number, min: number, max: number) =>
  Math.round(Math.min(max, Math.max(min, w)));

const sidebarTakes = () => viewport() >= MD && !sidebarHidden();
const sidePanelTakes = () => viewport() >= XL && !sidePanelHidden();

// Neither column pushes the other while being dragged: each is capped by what
// the other currently occupies. When the window shrinks, the side panel gives
// way first (it budgets against the sidebar's request), then the sidebar
// (against the side panel's rendered width), so they never overflow together.
const sidebarRequest = () =>
  within(sidebarWanted(), sidebarWidth.min, sidebarWidth.max);
const roomFor = (col: { min: number; max: number }, other: number) =>
  Math.max(col.min, Math.min(col.max, viewport() - MIN_MAIN - other));

export const sidePanelMax = () =>
  roomFor(sidePanelWidth, sidebarTakes() ? sidebarRequest() : 0);
export const sidePanelW = () =>
  within(sidePanelWanted(), sidePanelWidth.min, sidePanelMax());

export const sidebarMax = () =>
  roomFor(sidebarWidth, sidePanelTakes() ? sidePanelW() : 0);
export const sidebarW = () =>
  within(sidebarWanted(), sidebarWidth.min, sidebarMax());

// Narrow screens: panels are overlays, at most one open.
export type Drawer = 'sidebar' | 'side-panel' | null;
export const [drawer, setDrawer] = createSignal<Drawer>(null);

const sidebarIsColumn = () => matchMedia('(min-width: 48rem)').matches;
const sidePanelIsColumn = () => matchMedia('(min-width: 80rem)').matches;

// True for a moment while a column opens or closes, so the width animates
// then and not while dragging the edge or resizing the window.
export const [sliding, setSliding] = createSignal(false);
let slideTimer: ReturnType<typeof setTimeout> | undefined;
function slide() {
  setSliding(true);
  clearTimeout(slideTimer);
  slideTimer = setTimeout(() => setSliding(false), 250);
}

export function toggleSidebar() {
  if (sidebarIsColumn()) {
    slide();
    setSidebarHidden((h) => !h);
  } else setDrawer((d) => (d === 'sidebar' ? null : 'sidebar'));
}

export function toggleSidePanel() {
  if (sidePanelIsColumn()) {
    slide();
    setSidePanelHidden((h) => !h);
  } else setDrawer((d) => (d === 'side-panel' ? null : 'side-panel'));
}

export const closeDrawer = () => setDrawer(null);
