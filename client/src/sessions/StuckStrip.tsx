import { createSignal, Show } from 'solid-js';

import type { Stuck } from '@bica/shared/protocol';
import { retrySession } from './sessions';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';
import { AlertIcon, RestoreIcon } from '../ui/icons';

/**
 * On the composer's tray of a session whose work Pi Durable won't run
 * (docs/sessions.md): why, and Retry when crashes paused it. Stop, next to
 * the composer, ends it either way.
 */
export default function StuckStrip(props: { id: string; stuck: Stuck }) {
  const [busy, setBusy] = createSignal(false, { name: 'retryBusy' });
  const retry = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await retrySession(props.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="appear flex min-h-8 items-center gap-x-2 py-0.5 pr-1 pl-1.5 touch:min-h-11">
      <span class="flex min-w-0 flex-1 items-center gap-1 text-meta text-danger-ink [&_svg]:size-3.5 [&_svg]:shrink-0">
        <AlertIcon />
        <span class="truncate">
          {props.stuck === 'crashed'
            ? 'Paused after crashing Bica again and again'
            : 'Stuck: its code is gone from Bica. Stop ends it'}
        </span>
      </span>
      <Show when={props.stuck === 'crashed'}>
        <Button
          size="sm"
          variant="outline"
          title="Run it again; Stop ends it instead"
          disabled={busy()}
          onClick={() => void retry()}
        >
          <RestoreIcon />
          Retry
        </Button>
      </Show>
    </div>
  );
}
