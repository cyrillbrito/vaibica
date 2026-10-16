import { For, Show, createSignal } from 'solid-js';

import type { VoiceSettings as Settings } from '#lib/protocol';
import { setVoiceSettings } from '#lib/sessions';
import { musicLevel, setMusicLevel, type MusicLevel } from '#lib/voice';
import Alert from './ui/Alert';
import { Button, IconButton } from './ui/Button';
import { Segmented, segmentClass } from './ui/Segmented';
import Select from './ui/Select';
import { CloseIcon } from './ui/icons';

const SPEEDS = [
  { label: 'Slow', value: 0.75 },
  { label: 'Relaxed', value: 0.9 },
  { label: 'Normal', value: 1 },
  { label: 'Fast', value: 1.2 },
];

const MUSIC: { label: string; value: MusicLevel }[] = [
  { label: 'Off', value: 'off' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Loud', value: 'loud' },
];

/** How this session's voice calls sound; the parent opens the dialog. */
export default function VoiceSettings(props: {
  id: string;
  voice: Settings | null;
  ref: (dialog: HTMLDialogElement) => void;
}) {
  const [speed, setSpeed] = createSignal(1, { name: 'voiceSpeed' });
  const [busy, setBusy] = createSignal(false, { name: 'voiceBusy' });
  const [error, setError] = createSignal('', { name: 'voiceError' });
  let dialog!: HTMLDialogElement;
  let instructions!: HTMLTextAreaElement;

  return (
    <dialog
      ref={(el) => {
        dialog = el;
        props.ref(el);
      }}
      onToggle={(e) => {
        if (e.newState !== 'open') return;
        setSpeed(props.voice?.speed ?? 1);
        setError('');
        instructions.value = props.voice?.instructions ?? '';
      }}
      class="mx-0 mt-auto mb-0 flex max-h-[85dvh] w-full max-w-none flex-col overflow-hidden rounded-t-sheet border border-line bg-panel text-fg shadow-sheet backdrop:bg-black/40 not-open:hidden max-md:sheet md:pop md:m-auto md:max-h-[min(44rem,85dvh)] md:w-[32rem] md:rounded-card"
      aria-label="Voice"
      onClick={(e) => e.target === e.currentTarget && dialog.close()}
    >
      <header class="flex h-12 shrink-0 items-center gap-1 border-b border-line pr-2 pl-4">
        <h2 class="flex-1 font-semibold">Voice</h2>
        <IconButton title="Close" onClick={() => dialog.close()}>
          <CloseIcon />
        </IconButton>
      </header>
      <form
        class="flex flex-col gap-4 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await setVoiceSettings(props.id, {
              speed: speed(),
              instructions: instructions.value,
            });
            dialog.close();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div class="flex flex-col gap-1.5">
          <span class="text-meta text-muted">Speed</span>
          <Segmented class="self-start">
            <For each={SPEEDS} keyed={(s) => s.value}>
              {(s) => (
                <button
                  type="button"
                  class={segmentClass}
                  data-on={speed() === s().value ? '' : undefined}
                  aria-pressed={speed() === s().value ? 'true' : 'false'}
                  onClick={() => setSpeed(s().value)}
                >
                  {s().label}
                </button>
              )}
            </For>
          </Segmented>
        </div>
        <label class="flex flex-col gap-1.5">
          <span class="text-meta text-muted">Instructions</span>
          <textarea
            ref={(el) => (instructions = el)}
            rows="4"
            class="max-h-60 min-h-24 resize-none rounded-card border border-line bg-surface px-3 py-2.5 leading-snug outline-none [field-sizing:content] placeholder:text-muted focus:border-line-strong touch:text-read"
            placeholder="E.g. I'm learning French. Talk with me yourself in simple French, speak slowly with clear pauses, and gently correct my mistakes."
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-meta text-muted">Background music</span>
          <span class="flex items-center gap-2">
            <Select
              class="-ml-2.5 shrink-0"
              aria-label="Background music"
              value={musicLevel()}
              onChange={(e) =>
                setMusicLevel(e.currentTarget.value as MusicLevel)
              }
            >
              <For each={MUSIC} keyed={(m) => m.value}>
                {(m) => <option value={m().value}>{m().label}</option>}
              </For>
            </Select>
            <span class="text-meta text-muted">
              While the agent works. Every session, on this device.
            </span>
          </span>
        </label>
        <Show when={error()}>
          <Alert>{error()}</Alert>
        </Show>
        <div class="flex items-center gap-2">
          <p class="flex-1 text-meta text-muted">
            Only this session. Applies from the next call.
          </p>
          <Button type="submit" variant="soft" loading={busy()}>
            Save
          </Button>
        </div>
      </form>
    </dialog>
  );
}
