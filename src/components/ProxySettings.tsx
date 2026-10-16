import { For, Show, createSignal, untrack } from 'solid-js';

import { removeProxy, saveProxy, useAccounts } from '#lib/accounts';
import type { ProxyStatus } from '#lib/protocol';
import { useTopic } from '#lib/socket';
import { UsageList } from './PlanUsage';
import Alert from './ui/Alert';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Field, checkUrl } from './ui/Field';

/** Settings → CLI proxy: one CLIProxyAPI server for many plan accounts (docs/proxy.md). */
export default function ProxySettings() {
  const data = useAccounts();
  const usage = useTopic('plan.usage', () => ({}));
  const accounts = () => usage()?.filter((p) => p.provider === 'cliproxy');
  const [editing, setEditing] = createSignal(false, { name: 'proxyEditing' });

  return (
    <Card
      title="CLI proxy"
      description="A CLIProxyAPI server that holds many plan sign-ins and switches between them when one runs out. Tau lists its models as one provider."
      bare={
        <Show
          when={!editing() && data().proxy}
          fallback={
            <Form
              current={data().proxy}
              onDone={() => setEditing(false)}
              onCancel={data().proxy ? () => setEditing(false) : undefined}
            />
          }
        >
          {(proxy) => (
            <div class="flex flex-col divide-y divide-line rounded-sheet border border-line bg-surface">
              <div class="flex flex-col gap-2 px-3.5 py-3">
                <div class="flex items-baseline gap-3">
                  <span class="min-w-0 flex-1 truncate font-mono text-meta">
                    {proxy().url}
                  </span>
                  <span class="flex shrink-0 items-center gap-1.5 text-meta text-muted">
                    <span
                      class={[
                        'size-1.5 rounded-full',
                        proxy().error ? 'bg-danger' : 'bg-running',
                      ]}
                    />
                    <span class="tabular-nums">{proxy().models}</span> models
                  </span>
                </div>
                <Show when={proxy().error}>
                  {(error) => <Alert>{error()}</Alert>}
                </Show>
                <div class="-ml-1.5 flex gap-1.5">
                  <Button size="sm" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                  <Button size="sm" onClick={() => void removeProxy()}>
                    Remove
                  </Button>
                </div>
              </div>
              <Show
                when={proxy().managementKey}
                fallback={
                  <p class="px-3.5 py-3 text-meta text-muted">
                    Add the management key to see each account and its limits.
                  </p>
                }
              >
                <Show when={accounts()?.length}>
                  <div class="flex flex-col gap-2 px-3.5 py-3">
                    <UsageList usage={accounts()!} />
                    <p class="text-meta text-muted">
                      Limits are from each account's last reply through the
                      proxy. An account without bars hasn't answered yet.
                    </p>
                  </div>
                </Show>
              </Show>
            </div>
          )}
        </Show>
      }
    />
  );
}

function Form(props: {
  current: ProxyStatus | null;
  onDone: () => void;
  onCancel?: () => void;
}) {
  // The form starts from the saved URL; later changes don't overwrite typing.
  const [url, setUrl] = createSignal(
    untrack(() => props.current?.url ?? ''),
    { name: 'proxyUrl' },
  );
  const [apiKey, setApiKey] = createSignal('', { name: 'proxyApiKey' });
  const [managementKey, setManagementKey] = createSignal('', {
    name: 'proxyManagementKey',
  });
  const [busy, setBusy] = createSignal(false, { name: 'proxyBusy' });
  const [failed, setFailed] = createSignal<string | null>(null, {
    name: 'proxyError',
  });
  const saved = () => !!props.current;

  const [tried, setTried] = createSignal(false, { name: 'proxyTried' });
  const dirty = () =>
    url().trim() !== (props.current?.url ?? '') ||
    !!apiKey() ||
    !!managementKey();
  const discard = () => {
    setUrl(props.current?.url ?? '');
    setApiKey('');
    setManagementKey('');
    setFailed(null);
    setTried(false);
    props.onCancel?.();
  };

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setTried(true);
    if (checkUrl(url()).error) return;
    setBusy(true);
    setFailed(null);
    saveProxy({
      url: url().trim(),
      apiKey: apiKey().trim(),
      managementKey: managementKey().trim(),
    })
      .then(props.onDone, (error: Error) => setFailed(error.message))
      .finally(() => setBusy(false));
  };

  return (
    <form
      class="flex flex-col rounded-sheet border border-line bg-surface"
      onSubmit={submit}
    >
      <div class="flex flex-col gap-4 p-3.5">
        <Field
          label="Address"
          type="url"
          required
          placeholder="https://legion.example.ts.net:8317"
          hint="Where the proxy listens, with its port."
          value={url()}
          onInput={setUrl}
          check={checkUrl}
          touched={tried()}
        />
        <Field
          label={
            <>
              API key, one of the proxy's <code>api-keys</code>
            </>
          }
          type="password"
          required={!saved()}
          placeholder={saved() ? 'Saved. Leave empty to keep it.' : undefined}
          value={apiKey()}
          onInput={setApiKey}
        />
        <Field
          label="Management key"
          hint="Optional: shows each account and its limits."
          type="password"
          placeholder={
            props.current?.managementKey
              ? 'Saved. Leave empty to keep it.'
              : undefined
          }
          value={managementKey()}
          onInput={setManagementKey}
        />
        <Show when={failed()}>{(message) => <Alert>{message()}</Alert>}</Show>
      </div>
      {/* The save bar: says what's pending and offers a way back. */}
      <div class="flex min-h-12 items-center gap-1.5 rounded-b-sheet border-t border-line bg-panel/60 py-2 pr-2 pl-3.5">
        <span class="min-w-0 flex-1 truncate text-meta text-muted">
          <For each={[dirty()]}>
            {(d) => (
              <span class="appear inline-block">
                {!saved()
                  ? 'Not connected yet'
                  : d
                    ? 'Unsaved changes'
                    : 'Nothing changed'}
              </span>
            )}
          </For>
        </span>
        <Show when={props.onCancel || dirty()}>
          <Button type="button" size="md" onClick={discard}>
            {dirty() ? 'Discard' : 'Cancel'}
          </Button>
        </Show>
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={busy()}
          disabled={saved() && !dirty()}
        >
          {saved() ? 'Save' : 'Connect'}
        </Button>
      </div>
    </form>
  );
}
