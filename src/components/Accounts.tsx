import { For, Show, createMemo, createSignal } from 'solid-js';

import {
  answer,
  cancelSignIn,
  signIn,
  signOut,
  useAccounts,
} from '#lib/accounts';
import { useModels } from '#lib/models';
import type { Account, SignIn } from '#lib/protocol';
import Alert from './ui/Alert';
import { Button, buttonClass } from './ui/Button';
import { ExternalIcon, SpinnerIcon } from './ui/icons';
import { Card } from './ui/Card';
import { Field, checkKey } from './ui/Field';

/** Settings → Providers: who Tau can reach, and signing in or adding keys. */
export default function Accounts() {
  const data = useAccounts();
  const catalog = useModels();
  const [failed, setFailed] = createSignal<string | null>(null, {
    name: 'accountError',
  });
  const attempt = (action: Promise<unknown>) => {
    setFailed(null);
    action.catch((error: Error) => setFailed(error.message));
  };
  const connected = createMemo(() => data().accounts.filter((a) => a.status), {
    name: 'connectedAccounts',
  });
  const idle = createMemo(() => data().accounts.filter((a) => !a.status), {
    name: 'idleAccounts',
  });
  const count = (id: string) =>
    catalog().models.filter((m) => m.provider === id).length;

  const Row = (a: Account) => (
    <li class="flex flex-col gap-2.5 px-3.5 py-3">
      <div class="flex items-center gap-3">
        <span
          class={[
            'grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-panel font-semibold',
            !a.status && 'text-muted',
          ]}
          aria-hidden="true"
        >
          {a.name.slice(0, 1)}
        </span>
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
            <Show when={catalog().settings.model.provider === a.id}>
              <span class="rounded-sm bg-active px-1.5 text-meta">Default</span>
            </Show>
          </span>
          <Status account={a} />
        </span>
        <Show when={a.status?.saved && data().signIn?.account !== a.id}>
          <Button size="sm" onClick={() => attempt(signOut(a.id))}>
            {a.status?.type === 'oauth' ? 'Sign out' : 'Remove key'}
          </Button>
        </Show>
      </div>
      <Show when={!a.status && a.about}>
        <p class="pl-11 text-meta text-muted">
          {a.about}
          <Show when={a.link}>
            {(link) => (
              <>
                {' '}
                <a
                  class="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg"
                  href={link().url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {link().label}
                </a>
                .
              </>
            )}
          </Show>
          <Show when={a.env}>
            {(env) => (
              <>
                {' Or set '}
                <span class="font-mono">{env()}</span>.
              </>
            )}
          </Show>
        </p>
      </Show>
      <Show
        when={data().signIn?.account !== a.id}
        fallback={
          <Panel
            signIn={data().signIn!}
            name={a.name}
            onAnswer={(id, value) => attempt(answer(id, value))}
            onCancel={() => attempt(cancelSignIn())}
          />
        }
      >
        <Show when={!a.status?.saved}>
          <div class="flex flex-wrap gap-1.5 pl-11">
            <For each={a.methods}>
              {(m) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => attempt(signIn(a.id, m.type))}
                >
                  {m.label}
                </Button>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </li>
  );

  return (
    <>
      <Card
        title="Providers"
        description="Who Tau can reach: plans you sign in to and API keys."
        footer="Environment means the key comes from a variable set outside Tau. A key or sign-in saved here is stored in .data/auth.json on the server and wins over it. Tau never reads other apps' logins."
        bare={
          <Show when={!connected().length}>
            <p class="rounded-sheet border border-line bg-surface p-3.5 text-meta">
              Nothing is connected yet. Sign in with a plan or add an API key
              below to start a session.
            </p>
          </Show>
        }
      >
        <Show when={connected().length}>
          <ul class="flex flex-col divide-y divide-line">
            <For each={connected()}>{Row}</For>
          </ul>
        </Show>
      </Card>
      <Show when={failed()}>{(message) => <Alert>{message()}</Alert>}</Show>
      <Show when={idle().length}>
        <Card title="Not set up">
          <ul class="flex flex-col divide-y divide-line">
            <For each={idle()}>{Row}</For>
          </ul>
        </Card>
      </Show>
    </>
  );
}

function Status(props: { account: Account }) {
  return (
    <Show
      when={props.account.status}
      fallback={<span class="text-meta text-muted">Not set up</span>}
    >
      {(status) => (
        <span class="flex min-w-0 items-center gap-1.5 truncate text-meta text-muted">
          <span class="size-1.5 shrink-0 rounded-full bg-running" />
          <Show
            when={status().saved}
            fallback={
              <>
                Environment
                <span class="rounded-sm bg-surface px-1.5 font-mono">
                  {status().source}
                </span>
              </>
            }
          >
            {status().source}
          </Show>
        </span>
      )}
    </Show>
  );
}

function Panel(props: {
  signIn: SignIn;
  name: string;
  onAnswer: (prompt: string, value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = createSignal('', { name: 'signInAnswer' });
  const [tried, setTried] = createSignal(false, { name: 'signInTried' });
  const check = () =>
    props.signIn.prompt?.type === 'secret'
      ? checkKey(props.signIn.account, props.name)
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
