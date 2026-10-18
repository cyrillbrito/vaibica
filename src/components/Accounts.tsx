import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';

import {
  answer,
  cancelSignIn,
  signIn,
  signOut,
  useAccounts,
} from '#lib/accounts';
import { useModels } from '#lib/models';
import type { Account, SignIn } from '#lib/protocol';
import { PROXY_ABOUT, ProxyForm, ProxyRow, proxyDraft } from './ProxySettings';
import Alert from './ui/Alert';
import { Button, buttonClass } from './ui/Button';
import { Card } from './ui/Card';
import { Field, checkKey } from './ui/Field';
import { ExternalIcon, PlusIcon, SpinnerIcon } from './ui/icons';
import { Popover, PopoverSearch } from './ui/Popover';

type Method = Account['methods'][number]['type'];
type Choice =
  | { kind: 'method'; account: Account; type: Method }
  | { kind: 'proxy' };

/**
 * Settings → Providers: what Bica can reach, one row each, and Add provider
 * for the rest. Keys in the environment connect on their own.
 */
export default function Accounts() {
  const data = useAccounts();
  const catalog = useModels();
  const [failed, setFailed] = createSignal<string | null>(null, {
    name: 'accountError',
  });
  const [connectingProxy, setConnectingProxy] = createSignal(!!proxyDraft(), {
    name: 'proxyConnecting',
  });
  const attempt = (action: Promise<unknown>) => {
    setFailed(null);
    action.catch((error: Error) => setFailed(error.message));
  };
  const signingIn = () => data().signIn?.account;
  // Connected ones, and the one a sign-in is running for.
  const listed = createMemo(
    () => data().accounts.filter((a) => a.status || a.id === signingIn()),
    { name: 'listedAccounts' },
  );
  const empty = () => !listed().length && !data().proxy && !connectingProxy();
  const count = (id: string) =>
    catalog().models.filter((m) => m.provider === id).length;

  // The sign-in page opens in the click that asked for it, so it takes one
  // click instead of two. The page arrives a moment later, still inside the
  // browser's allowance for a popup; if it's blocked, the button stays.
  let clicked = 0;
  let picked: string | undefined;
  const choose = (c: Choice) => {
    if (c.kind === 'proxy') return setConnectingProxy(true);
    clicked = Date.now();
    attempt(signIn(c.account.id, c.type));
  };
  // Plan sign-ins first ask how: a browser login calls back to localhost,
  // which only loads on the dev machine, so elsewhere take the other way
  // (a code to copy or type) without asking.
  createEffect(
    () => data().signIn?.prompt,
    (prompt) => {
      if (prompt?.type !== 'select' || Date.now() - clicked > 5000) return;
      if (prompt.id === picked) return;
      const ids = prompt.options.map((o) => o.id);
      if (!ids.includes('browser') || ids.length !== 2) return;
      picked = prompt.id;
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(
        location.hostname,
      );
      attempt(
        answer(
          prompt.id,
          local ? 'browser' : ids.find((id) => id !== 'browser')!,
        ),
      );
    },
  );
  createEffect(
    () => data().signIn?.url,
    (url) => {
      if (url && Date.now() - clicked < 5000) {
        clicked = 0;
        window.open(url, '_blank', 'noopener');
      }
    },
  );

  const Row = (a: Account) => (
    <li class="flex flex-col gap-2.5 px-3.5 py-3">
      <div class="flex items-center gap-3">
        <Tile name={a.name} on={!!a.status} />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="flex items-center gap-2">
            <span class="truncate font-medium">{a.name}</span>
            <Show when={a.status && count(a.id)}>
              <span
                class="rounded-sm border border-line px-1 text-meta text-muted tabular-nums"
                title={`${count(a.id)} models`}
              >
                {count(a.id)}
              </span>
            </Show>
          </span>
          <Status account={a} />
        </span>
        <Show when={a.status?.saved && signingIn() !== a.id}>
          <Button size="sm" onClick={() => attempt(signOut(a.id))}>
            {a.status?.type === 'oauth' ? 'Sign out' : 'Remove'}
          </Button>
        </Show>
      </div>
      <Show when={signingIn() === a.id}>
        <Panel
          signIn={data().signIn!}
          account={a}
          onAnswer={(id, value) => {
            clicked = Date.now();
            attempt(answer(id, value));
          }}
          onCancel={() => attempt(cancelSignIn())}
        />
      </Show>
    </li>
  );

  return (
    <Card
      title="Providers"
      description="Where models come from: plans you sign in to, API keys, and a CLI proxy."
      footer={
        <>
          Keys already in the server's environment, like{' '}
          <code>EXA_API_KEY</code>, connect on their own. What you add here is
          kept in <code>.data/auth.json</code> and wins over them.
        </>
      }
    >
      <Show
        when={!empty()}
        fallback={
          <p class="px-3.5 py-3 text-meta text-muted">
            Nothing is connected yet. Add a provider to start a session.
          </p>
        }
      >
        <ul class="flex flex-col divide-y divide-line">
          <For each={listed()}>{Row}</For>
          <Show when={data().proxy}>
            {(proxy) => <ProxyRow proxy={proxy()} />}
          </Show>
          <Show when={connectingProxy() && !data().proxy}>
            <li class="flex flex-col gap-2.5 px-3.5 py-3">
              <div class="flex items-center gap-3">
                <Tile name="P" on={false} />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="font-medium">CLI proxy</span>
                  <span class="text-meta text-muted">{PROXY_ABOUT}</span>
                </span>
              </div>
              <ProxyForm
                current={null}
                onDone={() => setConnectingProxy(false)}
                onCancel={() => setConnectingProxy(false)}
              />
            </li>
          </Show>
        </ul>
      </Show>
      <Show when={failed()}>
        {(message) => (
          <div class="p-2">
            <Alert>{message()}</Alert>
          </div>
        )}
      </Show>
      <AddProvider
        accounts={data().accounts}
        proxy={!!data().proxy || connectingProxy()}
        onChoose={choose}
      />
    </Card>
  );
}

function Tile(props: { name: string; on: boolean }) {
  return (
    <span
      class={[
        'grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-panel font-semibold',
        !props.on && 'text-muted',
      ]}
      aria-hidden="true"
    >
      {props.name.slice(0, 1)}
    </span>
  );
}

function Status(props: { account: Account }) {
  return (
    <Show
      when={props.account.status}
      fallback={<span class="text-meta text-muted">Connecting…</span>}
    >
      {(status) => (
        <span class="flex min-w-0 items-center gap-1.5 text-meta text-muted">
          <span class="size-1.5 shrink-0 rounded-full bg-running" />
          <span class="truncate">
            <Show
              when={status().saved}
              fallback={
                <>
                  From <span class="font-mono">{status().source}</span>
                </>
              }
            >
              {status().type === 'oauth' ? 'Signed in' : 'API key'}
            </Show>
          </span>
        </span>
      )}
    </Show>
  );
}

/**
 * The last row of Providers: a menu of every way to connect what isn't
 * yet, one pick each, so a plan sign-in starts straight from it.
 */
function AddProvider(props: {
  accounts: Account[];
  proxy: boolean;
  onChoose: (choice: Choice) => void;
}) {
  const id = 'add-provider';
  let search: HTMLInputElement | undefined;
  const [query, setQuery] = createSignal('', { name: 'providerQuery' });
  const matches = (text: string) =>
    query()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((w) => text.toLowerCase().includes(w));
  // A provider saved in Bica is done; one from the environment can still
  // get a sign-in or key of its own, which wins.
  const open = () =>
    props.accounts.filter((a) => !a.status?.saved && a.id !== 'exa');
  const groups = createMemo(
    () => {
      const plans = open().flatMap((a) =>
        a.methods
          .filter(
            (m) => m.type === 'oauth' && matches(`${a.name} ${a.id} plan`),
          )
          .map((m) => ({ account: a, type: m.type, note: '' })),
      );
      const keys = open().flatMap((a) =>
        a.methods
          .filter(
            (m) => m.type === 'api_key' && matches(`${a.name} ${a.id} key`),
          )
          .map((m) => ({ account: a, type: m.type, note: '' })),
      );
      const exa = props.accounts.find(
        (a) => a.id === 'exa' && !a.status?.saved,
      );
      return [
        { label: 'Sign in with a plan', items: plans },
        { label: 'Add an API key', items: keys },
        {
          label: 'More',
          items: [
            ...(!props.proxy && matches('CLI proxy CLIProxyAPI')
              ? [
                  {
                    proxy: true as const,
                    note: 'Many plan sign-ins behind one server',
                  },
                ]
              : []),
            ...(exa && matches('Exa web search key')
              ? [
                  {
                    account: exa,
                    type: 'api_key' as const,
                    note: 'Web search for the agents',
                  },
                ]
              : []),
          ],
        },
      ].filter((g) => g.items.length);
    },
    { name: 'addProviderGroups' },
  );

  return (
    <>
      <button
        type="button"
        popovertarget={id}
        style={{ 'anchor-name': `--${id}` }}
        class="flex h-11 items-center gap-3 rounded-b-sheet px-3.5 text-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <span class="grid size-8 place-items-center" aria-hidden="true">
          <PlusIcon />
        </span>
        Add provider
      </button>
      <Popover
        id={id}
        label="Add provider"
        onToggle={(on) => {
          if (on && matchMedia('(hover: hover)').matches) search?.focus();
          if (!on) setQuery('');
        }}
      >
        <PopoverSearch
          ref={(el) => (search = el)}
          label="Search providers"
          value={query()}
          onInput={setQuery}
        />
        <div class="flex max-h-[60dvh] flex-col overflow-y-auto overscroll-contain p-1 md:max-h-96">
          <Show when={!groups().length}>
            <p class="px-2.5 py-3 text-meta text-muted">No provider matches.</p>
          </Show>
          <For each={groups()}>
            {(g) => (
              <>
                <div class="px-2.5 pt-2 pb-1 text-meta text-muted">
                  {g.label}
                </div>
                <For each={g.items}>
                  {(item) => (
                    <button
                      type="button"
                      class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-hover focus-visible:bg-active touch:py-2.5"
                      onClick={() => {
                        document.getElementById(id)?.hidePopover();
                        props.onChoose(
                          'proxy' in item
                            ? { kind: 'proxy' }
                            : {
                                kind: 'method',
                                account: item.account,
                                type: item.type,
                              },
                        );
                      }}
                    >
                      <span class="min-w-0 flex-1 truncate">
                        {'proxy' in item ? 'CLI proxy' : item.account.name}
                      </span>
                      <Show when={item.note}>
                        <span class="truncate text-meta text-muted">
                          {item.note}
                        </span>
                      </Show>
                    </button>
                  )}
                </For>
              </>
            )}
          </For>
        </div>
      </Popover>
    </>
  );
}

function Panel(props: {
  signIn: SignIn;
  account: Account;
  onAnswer: (prompt: string, value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = createSignal('', { name: 'signInAnswer' });
  const [tried, setTried] = createSignal(false, { name: 'signInTried' });
  const check = () =>
    props.signIn.prompt?.type === 'secret'
      ? checkKey(props.signIn.account, props.account.name)
      : undefined;

  return (
    <div class="ml-11 flex flex-col gap-3 rounded-card border border-line bg-panel p-3 appear max-sm:ml-0">
      <For each={props.signIn.notes}>
        {(note) => (
          <p class="text-meta">
            {note.message}
            <For each={note.links}>
              {(link) => (
                <>
                  {' '}
                  <a
                    class="underline underline-offset-2"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label ?? link.url}
                  </a>
                </>
              )}
            </For>
          </p>
        )}
      </For>
      <Show when={props.signIn.url}>
        {(url) => (
          <div class="flex flex-col items-start gap-1.5">
            <a
              class={buttonClass({ variant: 'primary', size: 'lg' })}
              href={url()}
              target="_blank"
              rel="noreferrer"
            >
              Open the sign-in page
              <ExternalIcon />
            </a>
            <Show when={!props.signIn.prompt && props.signIn.instructions}>
              <p class="text-meta text-muted">{props.signIn.instructions}</p>
            </Show>
          </div>
        )}
      </Show>
      <Show when={props.signIn.device}>
        {(device) => (
          <p class="flex flex-col gap-1">
            <span class="text-meta text-muted">
              Enter this code at{' '}
              <a
                class="underline underline-offset-2"
                href={device().uri}
                target="_blank"
                rel="noreferrer"
              >
                {device().uri}
              </a>
            </span>
            <span class="font-mono text-display select-all">
              {device().code}
            </span>
          </p>
        )}
      </Show>
      <Show when={props.signIn.prompt}>
        {(prompt) => (
          <Show
            when={prompt().type !== 'select'}
            fallback={
              <div class="flex flex-col gap-1.5">
                <span class="text-meta text-muted">{prompt().message}</span>
                <div class="flex flex-wrap gap-1.5">
                  <For each={prompt().options}>
                    {(option) => (
                      <Button
                        variant="outline"
                        size="md"
                        title={option.description}
                        onClick={() => props.onAnswer(prompt().id, option.id)}
                      >
                        {option.label}
                      </Button>
                    )}
                  </For>
                </div>
              </div>
            }
          >
            <form
              class="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setTried(true);
                if (!value().trim() || check()?.(value()).error) return;
                props.onAnswer(prompt().id, value().trim());
                setValue('');
                setTried(false);
              }}
            >
              <Field
                label={prompt().message}
                type={prompt().type === 'secret' ? 'password' : 'text'}
                placeholder={prompt().placeholder ?? undefined}
                value={value()}
                onInput={setValue}
                check={check()}
                touched={tried()}
                autofocus
                hint={
                  prompt().type === 'secret' && props.account.link ? (
                    <a
                      class="underline underline-offset-2 hover:text-fg"
                      href={props.account.link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Get one: {props.account.link.label}
                    </a>
                  ) : undefined
                }
              />
              <div class="flex justify-end">
                <Button type="submit" variant="soft" disabled={!value().trim()}>
                  {prompt().type === 'secret' ? 'Save' : 'Continue'}
                </Button>
              </div>
            </form>
          </Show>
        )}
      </Show>
      <Show when={props.signIn.progress && !props.signIn.error}>
        <p class="flex items-center gap-1.5 text-meta text-muted">
          <SpinnerIcon />
          {props.signIn.progress}
        </p>
      </Show>
      <Show when={props.signIn.error}>
        {(error) => <Alert>{error()}</Alert>}
      </Show>
      <div class="-ml-1.5">
        <Button size="sm" onClick={props.onCancel}>
          {props.signIn.error ? 'Close' : 'Cancel'}
        </Button>
      </div>
    </div>
  );
}
