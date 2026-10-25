import { For, createSignal } from 'solid-js';

import type { SessionSummary } from '@bica/shared/protocol';
import { archiveSession } from '#lib/sessions';
import StatusDot from './StatusDot';
import { Button, IconButton } from './ui/Button';
import { CheckMark } from './ui/CheckMark';
import { CloseIcon } from './ui/icons';

let dialog: HTMLDialogElement | undefined;
const [parent, setParent] = createSignal<SessionSummary>();
const [children, setChildren] = createSignal<SessionSummary[]>([]);
const [picked, setPicked] = createSignal<ReadonlySet<string>>(new Set(), {
  name: 'archivePicked',
});
let settle: (ids: string[]) => void = () => {};

const busy = (s: SessionSummary) =>
  s.status === 'running' || s.status === 'retrying';

/** Every open session `id` started, and the ones those started. */
function descendants(id: string, all: readonly SessionSummary[]) {
  const out: SessionSummary[] = [];
  const queue = [id];
  while (queue.length) {
    const from = queue.shift();
    for (const s of all)
      if (s.startedBy === from && !s.archivedAt && !out.includes(s)) {
        out.push(s);
        queue.push(s.id);
      }
  }
  return out;
}

/**
 * The ids to archive along with `s`, itself included; empty when cancelled.
 * Asks only when `s` started sessions that are still open: the finished ones
 * their parent leads come picked, the ones the user took over don't.
 */
function askArchive(
  s: SessionSummary,
  all: readonly SessionSummary[],
): Promise<string[]> {
  const kids = descendants(s.id, all);
  if (!kids.length) return Promise.resolve([s.id]);
  setParent(s);
  setChildren(kids);
  setPicked(
    new Set(kids.filter((k) => !busy(k) && k.parentDrives).map((k) => k.id)),
  );
  dialog?.showModal();
  return new Promise((resolve) => (settle = resolve));
}

/**
 * Archives `s` and the sessions picked to go with it. `leave` runs first with
 * their ids, to step off a page that is about to vanish.
 */
export async function archiveWithChildren(
  s: SessionSummary,
  all: readonly SessionSummary[],
  leave?: (ids: string[]) => void,
) {
  const ids = await askArchive(s, all);
  if (!ids.length) return;
  leave?.(ids);
  await Promise.allSettled(ids.map((id) => archiveSession(id)));
}

function finish(ids: string[]) {
  const done = settle;
  settle = () => {};
  done(ids);
  dialog?.close();
}

export default function ArchiveDialog() {
  const toggle = (id: string) => {
    const next = new Set(picked());
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  };
  const count = () => 1 + picked().size;

  return (
    <dialog
      ref={(el) => (dialog = el)}
      class="m-auto flex max-h-[85dvh] w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden pop rounded-card border border-line bg-panel text-fg shadow-sheet backdrop:bg-black/40 not-open:hidden"
      aria-label="Archive session"
      onClose={() => finish([])}
      onClick={(e) => e.target === e.currentTarget && finish([])}
    >
      <header class="flex h-12 shrink-0 items-center gap-1 border-b border-line pr-2 pl-4">
        <h2 class="min-w-0 flex-1 truncate font-semibold">
          {parent()?.title || 'Archive session'}
        </h2>
        <IconButton title="Close" onClick={() => finish([])}>
          <CloseIcon />
        </IconButton>
      </header>
      <p class="px-4 pt-3 pb-1 text-muted">
        This session started others. The checked ones are archived with it.
      </p>
      <ul class="flex-1 overflow-y-auto overscroll-contain p-2">
        <For each={children()} keyed={(s) => s.id}>
          {(s) => (
            <li>
              <button
                type="button"
                role="checkbox"
                aria-checked={picked().has(s().id) ? 'true' : 'false'}
                disabled={busy(s())}
                class="group/opt flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors not-disabled:hover:bg-hover disabled:opacity-50 touch:py-3"
                onClick={() => toggle(s().id)}
              >
                <CheckMark on={picked().has(s().id)} />
                <StatusDot status={s().status} />
                <span class="min-w-0 flex-1 truncate">
                  {s().title || 'Untitled'}
                </span>
                <span class="shrink-0 text-meta text-muted">
                  {busy(s())
                    ? 'Running'
                    : s().parentDrives
                      ? ''
                      : "You're in charge"}
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <footer class="flex shrink-0 justify-end gap-2 border-t border-line p-3 pb-[max(--spacing(3),env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={() => finish([])}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => finish([parent()!.id, ...picked()])}
        >
          {count() > 1 ? `Archive ${count()} sessions` : 'Archive'}
        </Button>
      </footer>
    </dialog>
  );
}
