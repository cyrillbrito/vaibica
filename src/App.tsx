import { Title } from '@solidjs/meta';
import { useLocation } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { Errored, Loading, Show, createMemo, onSettled } from 'solid-js';

import { HoldMusic } from './components/CallBar';
import CommandPalette from './components/CommandPalette';
import ContextMenu from './components/ui/ContextMenu';
import DataToggle from './components/DataToggle';
import Toaster from './components/ui/Toast';
import Failed from './components/ui/Failed';
import Inspector from './components/Inspector';
import ProjectPicker from './components/ProjectPicker';
import ArchiveDialog from './components/ArchiveDialog';
import Resizer from './components/ui/Resizer';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import {
  closeDrawer,
  drawer,
  inspectorHidden,
  inspectorMax,
  inspectorW,
  inspectorWidth,
  noPanels,
  setInspectorW,
  setSidebarW,
  sidebarHidden,
  sidebarMax,
  sidebarW,
  sidebarWidth,
  sliding,
  trackViewport,
} from '#lib/layout';
import { Router } from './router';
import './App.css';

// Without `on`, a navigation holds the old page until the new one's data
// arrives, so a tap looks ignored. With it, the new page's frame shows at
// once and fills in: no spinner, just an answer to the tap. Keyed by the kind
// of page: within one kind, the page keeps its frame and its own boundaries
// wait for the rest (the session page does).
function Page(props: { children: JSX.Element }) {
  const location = useLocation();
  const kind = createMemo(() => location.pathname.split('/')[1], {
    name: 'pageKind',
  });
  return (
    <Loading on={kind()} fallback={<TopBar />}>
      {props.children}
    </Loading>
  );
}

export default function App() {
  onSettled(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    // An overlay left open would turn into a column and keep main inert.
    const queries = ['(min-width: 48rem)', '(min-width: 80rem)'].map((q) =>
      matchMedia(q),
    );
    const untrackViewport = trackViewport();
    addEventListener('keydown', onKey);
    queries.forEach((q) => q.addEventListener('change', closeDrawer));
    return () => {
      untrackViewport();
      removeEventListener('keydown', onKey);
      queries.forEach((q) => q.removeEventListener('change', closeDrawer));
    };
  });

  return (
    <Router>
      {(props) => (
        <div class="flex h-dvh overflow-hidden">
          <Title>Bica</Title>

          {/* Phone: drawer from the left. md+: a column. */}
          <div
            class={[
              'fixed inset-y-0 left-0 z-30 flex w-[min(18rem,85vw)] transition-[translate,visibility] duration-200 ease-drawer',
              'md:relative md:w-(--w) md:min-w-0 md:shrink-0 md:translate-x-0',
              // Hidden is zero wide, not gone, so it can slide: the content
              // keeps its width and is pushed out past the left edge.
              'md:justify-end md:[&>nav]:min-w-(--full)',
              sliding() &&
                'md:motion-safe:transition-[width,visibility] md:motion-safe:duration-200 md:motion-safe:ease-out',
              (sidebarHidden() || sliding()) && 'md:overflow-hidden',
              drawer() === 'sidebar'
                ? 'translate-x-0 shadow-sheet md:shadow-none'
                : 'invisible -translate-x-full',
              sidebarHidden() ? 'md:invisible' : 'md:visible',
            ]}
            style={{
              '--w': sidebarHidden() ? '0px' : `${sidebarW()}px`,
              '--full': `${sidebarW()}px`,
            }}
          >
            <Resizer
              class="hidden md:block"
              side="right"
              label="Resize sessions"
              width={sidebarW()}
              min={sidebarWidth.min}
              initial={sidebarWidth.initial}
              max={sidebarMax()}
              onResize={setSidebarW}
            />
            {/* Blank until the data arrives: it is quick, a spinner would only flash. */}
            <Errored fallback={(error) => <Failed error={error()} />}>
              <Loading fallback={<nav class="flex-1 bg-panel" />}>
                <Sidebar />
                <HoldMusic />
              </Loading>
            </Errored>
          </div>

          <main class="flex min-w-0 flex-1 flex-col" inert={drawer() !== null}>
            <Errored fallback={(error) => <Failed error={error()} />}>
              <Page>{props.children}</Page>
            </Errored>
          </main>

          {/* Phone: bottom sheet. md–xl: drawer from the right. xl+: a column. */}
          <Show when={!noPanels()}>
            <div
              class={[
                'fixed inset-x-0 bottom-0 z-30 flex h-[85dvh] overflow-hidden rounded-t-sheet transition-[translate,visibility] duration-200 ease-drawer',
                'md:inset-y-0 md:left-auto md:h-auto md:w-96 md:max-w-[85vw] md:rounded-none',
                'xl:relative xl:w-(--w) xl:max-w-none xl:min-w-0 xl:shrink-0 xl:translate-0',
                // Like the sidebar: zero wide when hidden, content slides out right.
                'xl:[&>aside]:min-w-(--full)',
                sliding() &&
                  'xl:motion-safe:transition-[width,visibility] xl:motion-safe:duration-200 xl:motion-safe:ease-out',
                inspectorHidden() || sliding()
                  ? 'xl:overflow-hidden'
                  : 'xl:overflow-visible',
                drawer() === 'inspector'
                  ? 'translate-0 shadow-sheet xl:shadow-none'
                  : 'invisible translate-y-full md:translate-x-full md:translate-y-0',
                inspectorHidden() ? 'xl:invisible' : 'xl:visible',
              ]}
              style={{
                '--w': inspectorHidden() ? '0px' : `${inspectorW()}px`,
                '--full': `${inspectorW()}px`,
              }}
            >
              <Resizer
                class="hidden xl:block"
                side="left"
                label="Resize files and changes"
                width={inspectorW()}
                min={inspectorWidth.min}
                initial={inspectorWidth.initial}
                max={inspectorMax()}
                onResize={setInspectorW}
              />
              <Loading fallback={<aside class="flex-1 bg-panel" />}>
                <Inspector />
              </Loading>
            </div>
          </Show>

          <ProjectPicker />
          <ArchiveDialog />
          <CommandPalette />
          <ContextMenu />
          <Toaster />
          {import.meta.env.DEV && <DataToggle />}

          <Show when={drawer()}>
            <button
              class={[
                'fixed inset-0 z-20 cursor-default bg-black/40',
                drawer() === 'sidebar' ? 'md:hidden' : 'xl:hidden',
              ]}
              aria-label="Close panel"
              tabindex="-1"
              onClick={closeDrawer}
            />
          </Show>
        </div>
      )}
    </Router>
  );
}
