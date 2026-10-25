import { createSignal } from 'solid-js';

import { useModels } from '../models/models';
import { tonightAction } from './sessions';
import { IconButton } from '../ui/Button';
import { toast } from '../ui/Toast';
import { CloseIcon, MoonIcon } from '../ui/icons';

/**
 * On the composer's tray of a session held for tonight (docs/night-runs.md):
 * when it starts, and × to cancel. The prompt itself is in the composer, which
 * saves edits as you type and runs it now.
 */
export default function TonightStrip(props: {
  id: string;
  // Before cancelling, so the composer keeps the prompt as a draft.
  onCancel: () => void;
}) {
  const models = useModels();
  const [busy, setBusy] = createSignal(false, { name: 'tonightBusy' });
  const cancel = async () => {
    if (busy()) return;
    setBusy(true);
    props.onCancel();
    try {
      await tonightAction(props.id, 'cancel');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="appear flex min-h-8 items-center gap-x-2 py-1 pr-1 pl-1.5 touch:min-h-11">
      <span class="flex min-w-0 flex-1 items-center gap-1 text-meta text-accent-ink [&_svg]:size-3.5">
        <MoonIcon />
        <span class="truncate">
          Runs tonight at {models().settings.nightStart}
        </span>
      </span>
      <IconButton
        size="sm"
        title="Cancel the night run, keep the prompt as a draft"
        disabled={busy()}
        onClick={() => void cancel()}
      >
        <CloseIcon />
      </IconButton>
    </div>
  );
}
