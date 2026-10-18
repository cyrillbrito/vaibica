import { For, Show, createSignal, untrack } from 'solid-js';

import { removeProxy, saveProxy } from '#lib/accounts';
import type { ProxyStatus } from '#lib/protocol';
import { useTopic } from '#lib/socket';
import { UsageList } from './PlanUsage';
import Alert from './ui/Alert';
import { Button } from './ui/Button';
import { Field, checkUrl } from './ui/Field';

export const PROXY_ABOUT =
  'A CLIProxyAPI server that holds many plan sign-ins and switches between them when one runs out. Its models show as one provider.';

type Draft = { url: string; apiKey: string; managementKey: string };
const DRAFT_KEY = 'bica.proxyDraft';

/**
 * A half-filled proxy form, kept on this device until Connect, Save, or
 * Discard, so leaving the page doesn't lose it. While there is one, the
 * form opens with it.
 */
export function proxyDraft(): Draft | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

const keepDraft = (draft: Draft | null) =>
  draft
    ? localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    : localStorage.removeItem(DRAFT_KEY);

/** Settings → Providers: the CLIProxyAPI server, once connected (docs/proxy.md). */
export function ProxyRow(props: { proxy: ProxyStatus }) {
  const usage = useTopic('plan.usage', () => ({}));
  const accounts = () => usage()?.filter((p) => p.provider === 'cliproxy');
  const [editing, setEditing] = createSignal(!!proxyDraft(), {
    name: 'proxyEditing',
  });

  return (
    <li class="flex flex-col gap-2.5 px-3.5 py-3">
      <div class="flex items-center gap-3">
        <span
          class="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-panel font-semibold"
          aria-hidden="true"
        >
          P
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="flex items-center gap-2">
            <span class="truncate font-medium">CLI proxy</span>
            <span
              class="rounded-sm border border-line px-1 text-meta text-muted tabular-nums"
              title={`${props.proxy.models} models`}
            >
              {props.proxy.models}
            </span>
          </span>
          <span class="flex min-w-0 items-center gap-1.5 text-meta text-muted">
            <span
              class={[
                'size-1.5 shrink-0 rounded-full',
                props.proxy.error ? 'bg-danger' : 'bg-running',
              ]}
            />
            <span class="truncate font-mono">{props.proxy.url}</span>
          </span>
        </span>
        <Show when={!editing()}>
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" onClick={() => void removeProxy()}>
            Remove
          </Button>
        </Show>
      </div>
      <Show when={props.proxy.error}>
        {(error) => (
          <div class="pl-11 max-sm:pl-0">
            <Alert>{error()}</Alert>
          </div>
        )}
      </Show>
      <Show when={editing()}>
        <ProxyForm
          current={props.proxy}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </Show>
      <Show
        when={props.proxy.managementKey}
        fallback={
          <p class="pl-11 text-meta text-muted max-sm:pl-0">
            Add the management key to see each account and its limits.
          </p>
        }
      >
        <Show when={accounts()?.length}>
          <div class="flex flex-col gap-2 pl-11 max-sm:pl-0">
            <UsageList usage={accounts()!} />
            <p class="text-meta text-muted">
              Limits are from each account's last reply through the proxy. An
              account without bars hasn't answered yet.
            </p>
          </div>
        </Show>
      </Show>
    </li>
  );
}

/** Connects the proxy, or changes its address and keys. */
export function ProxyForm(props: {
  current: ProxyStatus | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  // The form starts from the draft or the saved URL; later changes don't
  // overwrite typing.
  const draft = proxyDraft();
  const [url, setUrl] = createSignal(
    draft?.url ?? untrack(() => props.current?.url ?? ''),
    { name: 'proxyUrl' },
  );
  const [apiKey, setApiKey] = createSignal(draft?.apiKey ?? '', {
    name: 'proxyApiKey',
  });
  const [managementKey, setManagementKey] = createSignal(
    draft?.managementKey ?? '',
    { name: 'proxyManagementKey' },
  );
  // Signals read back their new value only after the update settles, so
  // the draft is built from the typed value instead.
  const remember = (change: Partial<Draft>) => {
    const next = {
      url: url(),
      apiKey: apiKey(),
      managementKey: managementKey(),
      ...change,
    };
    const changed =
      next.url.trim() !== (props.current?.url ?? '') ||
      !!next.apiKey ||
      !!next.managementKey;
    keepDraft(changed ? next : null);
  };
  const cancel = () => {
    keepDraft(null);
    props.onCancel();
  };
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
      .then(
        () => {
          keepDraft(null);
          props.onDone();
        },
        (error: Error) => setFailed(error.message),
      )
      .finally(() => setBusy(false));
  };

  return (
    <form
      class="ml-11 flex flex-col rounded-card border border-line bg-panel appear max-sm:ml-0"
      onSubmit={submit}
    >
      <div class="flex flex-col gap-4 p-3">
        <Field
          label="Address"
          type="url"
          required
          placeholder="https://legion.example.ts.net:8317"
          hint="Where the proxy listens, with its port."
          value={url()}
          onInput={(v) => {
            setUrl(v);
            remember({ url: v });
          }}
          check={checkUrl}
          touched={tried()}
          autofocus={!saved()}
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
          onInput={(v) => {
            setApiKey(v);
            remember({ apiKey: v });
          }}
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
          onInput={(v) => {
            setManagementKey(v);
            remember({ managementKey: v });
          }}
        />
        <Show when={failed()}>{(message) => <Alert>{message()}</Alert>}</Show>
      </div>
      {/* The save bar: says what's pending and offers a way back. */}
      <div class="flex min-h-12 items-center gap-1.5 rounded-b-card border-t border-line py-2 pr-2 pl-3">
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
        <Button type="button" size="md" onClick={cancel}>
          {dirty() ? 'Discard' : 'Cancel'}
        </Button>
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
