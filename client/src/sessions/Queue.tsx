import type { ConversationView, InboxItem } from '@earendil-works/pi-durable';
import { For, Show, createMemo, createSignal } from 'solid-js';

import { pushQueued, withdrawQueued } from './sessions';
import type { ComposerApi } from './Composer';
import { IconButton } from '../ui/Button';
import { CloseIcon, PencilIcon, PushIcon, QueueIcon } from '../ui/icons';
import { Spinner } from '../ui/Spinner';
import { errorText } from '../ui/errors';

type Queued = Extract<InboxItem, { content: unknown }>;

export default function Queue(props: {
  id: string;
  view: ConversationView;
  composer: () => ComposerApi | undefined;
}) {
  const items = createMemo(
    () =>
      (
        (props.view.docs['pi.inbox'] as { items?: InboxItem[] } | undefined)
          ?.items ?? []
      ).filter((i): i is Queued => i.mode !== 'write'),
    {
      name: 'queuedItems',
      // The view changes on every streamed token; the inbox rarely does.
      equals: (a, b) =>
        a.length === b.length && a.every((item, i) => item === b[i]),
    },
  );
  // Ids with a request in flight, so a double tap doesn't send twice.
  const [busy, setBusy] = createSignal<number[]>([]);

  const act = async (item: Queued, action: 'push' | 'edit' | 'remove') => {
    const id = Number(item.id);
    if (busy().includes(id)) return;
    setBusy((list) => [...list, id]);
    try {
      if (action === 'push') {
        if (!(await pushQueued(props.id, id)))
          props.composer()?.problem('Already sent');
        return;
      }
      const taken = await withdrawQueued(props.id, id);
      if (!taken) props.composer()?.problem('Already sent');
      else if (action === 'edit')
        props.composer()?.restore(taken.prompt, taken.images);
    } catch (error) {
      props.composer()?.problem(errorText(error));
    } finally {
      setBusy((list) => list.filter((i) => i !== id));
    }
  };

  return (
    <Show when={items().length}>
      {/* On the composer's tray, above the box: lines, not cards. */}
      <ul class="flex flex-col pt-0.5 pb-1">
        <For each={items()} keyed={(i) => i.id}>
          {(item) => {
            const text = () => textOf(item().content);
            const images = () => imageCount(item().content);
            const steer = () => item().mode === 'steer';
            const pending = () => busy().includes(Number(item().id));
            return (
              <li
                class={[
                  'appear flex min-h-8 items-center gap-2 rounded-lg py-0.5 pl-1.5 transition-colors hover:bg-hover touch:min-h-11',
                  pending() && 'opacity-60',
                ]}
              >
                <span
                  class={[
                    'flex shrink-0 items-center gap-1 text-meta [&_svg]:size-3.5',
                    steer() ? 'text-accent' : 'text-muted',
                  ]}
                  title={
                    steer()
                      ? 'Joins the run after the current turn'
                      : 'Sent when the run ends'
                  }
                >
                  {pending() ? (
                    <Spinner />
                  ) : steer() ? (
                    <PushIcon />
                  ) : (
                    <QueueIcon />
                  )}
                  {steer() ? 'Next step' : 'Queued'}
                </span>
                <button
                  type="button"
                  class="min-w-0 flex-1 truncate text-left"
                  title="Edit"
                  disabled={pending()}
                  onClick={() => void act(item(), 'edit')}
                >
                  {text() || `${images()} image${images() === 1 ? '' : 's'}`}
                  <Show when={text() && images()}>
                    <span class="text-muted">
                      {' '}
                      · {images()} image{images() === 1 ? '' : 's'}
                    </span>
                  </Show>
                </button>
                <div class="flex shrink-0 items-center">
                  <Show when={!steer()}>
                    <IconButton
                      size="sm"
                      title="Send now: after the current turn"
                      disabled={pending()}
                      onClick={() => void act(item(), 'push')}
                    >
                      <PushIcon />
                    </IconButton>
                  </Show>
                  <IconButton
                    size="sm"
                    title="Edit"
                    disabled={pending()}
                    onClick={() => void act(item(), 'edit')}
                  >
                    <PencilIcon />
                  </IconButton>
                  <IconButton
                    size="sm"
                    title="Remove"
                    disabled={pending()}
                    onClick={() => void act(item(), 'remove')}
                  >
                    <CloseIcon />
                  </IconButton>
                </div>
              </li>
            );
          }}
        </For>
      </ul>
    </Show>
  );
}

function blocks(content: Queued['content']) {
  return typeof content === 'string'
    ? [{ type: 'text', text: content }]
    : (content as readonly { type: string; text?: string }[]);
}

function textOf(content: Queued['content']) {
  return blocks(content)
    .flatMap((b) => (b.type === 'text' && b.text ? [b.text] : []))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function imageCount(content: Queued['content']) {
  return blocks(content).filter((b) => b.type === 'image').length;
}
