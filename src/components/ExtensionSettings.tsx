import { For, Show, createSignal } from 'solid-js';

import type { Manifest, Setting as SettingSpec } from '#extensions/contract';
import { updateExtension } from '#lib/extensions';
import type { ExtensionState } from '#lib/protocol';
import { Button } from './ui/Button';
import { Setting } from './ui/Card';
import { Field, checkKey } from './ui/Field';
import { toast } from './ui/Toast';

/**
 * The rows Settings → Extensions draws under an extension's switch, one per
 * setting its manifest declares (docs/extensions.md).
 */
export default function ExtensionSettings(props: {
  manifest: Manifest;
  state: ExtensionState | undefined;
}) {
  return (
    <For each={Object.keys(props.manifest.settings ?? {})}>
      {(key) => (
        <Secret
          manifest={props.manifest}
          name={key}
          spec={props.manifest.settings![key]!}
          saved={props.state?.settings[key]}
        />
      )}
    </For>
  );
}

function Secret(props: {
  manifest: Manifest;
  name: string;
  spec: SettingSpec;
  saved: ExtensionState['settings'][string] | undefined;
}) {
  const [editing, setEditing] = createSignal(false, { name: 'secretEditing' });
  const [value, setValue] = createSignal('', { name: 'secretValue' });
  const [tried, setTried] = createSignal(false, { name: 'secretTried' });
  const check = () => checkKey(props.name, props.spec.label);
  const save = (next: string | null) =>
    updateExtension({
      id: props.manifest.id,
      settings: { [props.name]: next },
    }).then(
      () => {
        setEditing(false);
        setValue('');
        setTried(false);
      },
      (error: unknown) =>
        toast.error(error instanceof Error ? error.message : String(error)),
    );
  const link = () =>
    props.spec.link && (
      <a
        class="underline underline-offset-2 hover:text-fg"
        href={props.spec.link.url}
        target="_blank"
        rel="noreferrer"
      >
        Get one: {props.spec.link.label}
      </a>
    );

  return (
    <Show
      when={editing()}
      fallback={
        <Setting
          label={props.spec.label}
          hint={
            props.saved?.saved
              ? props.saved.hint
                ? `Key ending in ${props.saved.hint}`
                : 'Saved'
              : link() || 'Not set'
          }
        >
          <Show
            when={props.saved?.saved}
            fallback={
              <Button size="sm" onClick={() => setEditing(true)}>
                Add key
              </Button>
            }
          >
            <Button size="sm" onClick={() => void save(null)}>
              Remove
            </Button>
          </Show>
        </Setting>
      }
    >
      <form
        class="flex flex-col gap-2 px-3.5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (!value().trim() || check()(value()).error) return;
          void save(value().trim());
        }}
      >
        <Field
          label={props.spec.label}
          type="password"
          value={value()}
          onInput={setValue}
          check={check()}
          touched={tried()}
          autofocus
          hint={link()}
        />
        <div class="flex justify-end gap-1">
          <Button size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="soft" disabled={!value().trim()}>
            Save
          </Button>
        </div>
      </form>
    </Show>
  );
}
