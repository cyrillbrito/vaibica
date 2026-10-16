import { For, Show, createSignal, onSettled } from 'solid-js';

import { CHATS_ID, useProjects } from '#lib/projects';
import { openPalette } from './CommandPalette';
import { openProjectPicker } from './ProjectPicker';
import { Button, IconButton } from './ui/Button';
import { CloseIcon, DrawnCheckIcon } from './ui/icons';
import Kbd from './ui/Kbd';

const KEY = 'tau.tipsClosed';

interface Tip {
  id: string;
  title: string;
  text: string;
  keys?: string;
  action: string;
  primary?: boolean;
  done?: () => boolean;
  run: () => void;
}

/**
 * A few first steps under the composer while nothing is in progress, after
 * affectUI's Tips Panel: a grey tray with a white card of tips, each with
 * one action; a tip whose step is done shows a drawn check instead. Closed
 * for good with ×, per device.
 */
export default function HomeTips(props: { onVoice: () => void }) {
  const projects = useProjects();
  // Read after the first paint: the server has no localStorage.
  const [closed, setClosed] = createSignal(true, { name: 'tipsClosed' });
  onSettled(() => {
    setClosed(localStorage.getItem(KEY) === '1');
  });
  const [used, setUsed] = createSignal<string[]>([], { name: 'tipsUsed' });

  const tips: Tip[] = [
    {
      id: 'project',
      title: 'Add a project',
      text: 'Pick a folder. Each feature can get its own worktree, so agents never collide.',
      action: 'Add project',
      primary: true,
      done: () => projects().some((p) => p.id !== CHATS_ID),
      run: openProjectPicker,
    },
    {
      id: 'search',
      title: 'Jump anywhere',
      text: 'Sessions, projects, terminals and actions from one field.',
      keys: '⌘K',
      action: 'Try it',
      run: openPalette,
    },
    {
      id: 'voice',
      title: 'Start by talking',
      text: 'A voice call starts a session; the first thing you say is the prompt.',
      action: 'Call',
      run: () => props.onVoice(),
    },
  ];
  const isDone = (t: Tip) => used().includes(t.id) || !!t.done?.();

  const close = () => {
    localStorage.setItem(KEY, '1');
    setClosed(true);
  };

  return (
    <Show when={!closed()}>
      <section
        class="appear flex flex-col rounded-tray bg-panel p-1"
        aria-label="Tips"
      >
        <header class="flex min-h-9 items-center gap-2 pr-1 pl-3">
          <h2 class="flex-1 font-semibold">Get started</h2>
          <span class="text-meta text-muted tabular-nums" aria-live="polite">
            {tips.filter(isDone).length}/{tips.length} done
          </span>
          <IconButton size="sm" title="Close tips" onClick={close}>
            <CloseIcon />
          </IconButton>
        </header>
        <ul class="grid gap-2 rounded-sheet border border-line bg-surface p-2 sm:grid-cols-3">
          <For each={tips}>
            {(t, i) => (
              <li
                class={[
                  'appear flex flex-col items-start gap-1 rounded-card border border-line p-3 transition-colors',
                  isDone(t) && 'bg-panel',
                ]}
                style={{ 'transition-delay': `${80 + i() * 50}ms` }}
              >
                <p class="font-medium">{t.title}</p>
                <p class="flex-1 text-meta text-muted">
                  {t.text}
                  <Show when={t.keys}>
                    {' '}
                    <Kbd class="align-[1px]">{t.keys}</Kbd>
                  </Show>
                </p>
                <Show
                  when={!isDone(t)}
                  fallback={
                    <span class="mt-1.5 flex h-7 items-center gap-1.5 text-meta font-medium text-running">
                      <DrawnCheckIcon /> Done
                    </span>
                  }
                >
                  <Button
                    size="md"
                    variant={t.primary ? 'primary' : 'outline'}
                    class="mt-1.5"
                    onClick={() => {
                      setUsed((u) => [...u, t.id]);
                      t.run();
                    }}
                  >
                    {t.action}
                  </Button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}
