import { For, Show, createSignal } from 'solid-js';

import { addProject, listDirs, setCurrentTarget } from './projects';
import type { DirListing } from '@bica/shared/protocol';
import Alert from '../ui/Alert';
import { Button, IconButton } from '../ui/Button';
import { createHighlight } from '../ui/Highlight';
import { ArrowUpIcon, CloseIcon, FolderIcon } from '../ui/icons';

let dialog: HTMLDialogElement | undefined;
const [listing, setListing] = createSignal<DirListing>();
const [error, setError] = createSignal('');
// The hover fill glides between folders, as in the context menu.
let hideHighlight = () => {};

async function go(path?: string) {
  try {
    setListing(await listDirs(path));
    hideHighlight();
    setError('');
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  }
}

export function openProjectPicker() {
  dialog?.showModal();
  void go(listing()?.path);
}

export default function ProjectPicker() {
  const highlight = createHighlight();
  hideHighlight = () => highlight.move();
  const add = async () => {
    const path = listing()?.path;
    if (!path) return;
    try {
      // A worktree joins its repo's project, so pick that folder in it.
      setCurrentTarget({ projectId: await addProject(path), cwd: path });
      dialog?.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <dialog
      ref={(el) => (dialog = el)}
      class="m-auto flex h-[min(36rem,85dvh)] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden pop rounded-card border border-line bg-panel text-fg shadow-sheet backdrop:bg-black/40 not-open:hidden"
      aria-label="Add project"
      // Clicks on the backdrop land on the dialog itself.
      onClick={(e) => e.target === e.currentTarget && dialog?.close()}
    >
      <header class="flex h-12 shrink-0 items-center gap-1 border-b border-line pr-2 pl-4">
        <h2 class="flex-1 font-semibold">Add project</h2>
        <IconButton title="Close" onClick={() => dialog?.close()}>
          <CloseIcon />
        </IconButton>
      </header>
      <div class="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
        <IconButton
          title="Parent folder"
          disabled={!listing()?.parent}
          onClick={() => go(listing()?.parent ?? undefined)}
        >
          <ArrowUpIcon />
        </IconButton>
        {/* rtl so a long path is cut at the start; bdi keeps its slashes in order. */}
        <span class="min-w-0 flex-1 truncate text-left font-mono text-meta text-muted [direction:rtl]">
          <bdi>{listing()?.path}</bdi>
        </span>
      </div>
      <Show when={error()}>
        <Alert class="mx-2 mt-2">{error()}</Alert>
      </Show>
      <ul
        class="relative flex-1 overflow-y-auto overscroll-contain p-2"
        onPointerLeave={() => highlight.move()}
      >
        <highlight.Pill class="inset-x-2 rounded-lg bg-hover" />
        <For
          each={listing()?.dirs}
          keyed={(d) => d.path}
          fallback={
            <Show when={listing()}>
              <li class="px-3 py-2 text-muted">No folders here</li>
            </Show>
          }
        >
          {(d) => (
            <li>
              <button
                class="relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-muted transition-colors hover:text-fg focus-visible:bg-active touch:py-3"
                onClick={() => go(d().path)}
                onPointerEnter={(e) => highlight.move(e.currentTarget)}
              >
                <FolderIcon />
                <span class="flex-1 truncate">{d().name}</span>
                <Show when={d().git}>
                  <span class="rounded-sm bg-active px-1.5 text-meta">git</span>
                </Show>
              </button>
            </li>
          )}
        </For>
      </ul>
      <footer class="flex shrink-0 justify-end border-t border-line p-3 pb-[max(--spacing(3),env(safe-area-inset-bottom))]">
        <Button variant="primary" disabled={!listing()} onClick={add}>
          Add this folder
        </Button>
      </footer>
    </dialog>
  );
}
