import { Title } from '@solidjs/meta';
import { For, Show, createMemo, createSignal } from 'solid-js';

import Accounts from '../components/Accounts';
import { Card, Setting, Toggle } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import Chevron from '../components/ui/Chevron';
import Summary from '../components/ui/Summary';
import ModelPicker from '../components/ModelPicker';
import ProxySettings from '../components/ProxySettings';
import TopBar from '../components/TopBar';
import Input from '../components/ui/Input';
import { toast } from '../components/ui/Toast';
import { SearchIcon } from '../components/ui/icons';
import { Segmented, segmentClass } from '../components/ui/Segmented';
import {
  MODE_LABELS,
  MODES,
  mode as testMode,
  openWithTestData,
} from '#lib/fixtures';
import { modelKey, updateSettings, useModels } from '#lib/models';
import { motion, setMotion, type Motion } from '#lib/motion';
import { setSoundOn, soundOn } from '#lib/sound';
import { setTheme, theme, type Theme } from '#lib/theme';
import { hideThinking, setHideThinking } from '#lib/thinking';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const MOTIONS: { value: Motion; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'full', label: 'Full' },
  { value: 'reduced', label: 'Reduced' },
];

export default function Settings() {
  const catalog = useModels();
  const [filter, setFilter] = createSignal('', { name: 'modelFilter' });
  const enabled = createMemo(() => new Set(catalog().settings.enabled), {
    name: 'enabledModels',
  });
  // Big catalogs (OpenRouter has hundreds) show only the chosen models until
  // you search, so the page stays short.
  const groups = createMemo(
    () => {
      const c = catalog();
      const words = filter().toLowerCase().split(/\s+/).filter(Boolean);
      return c.providers.map((p) => {
        const all = c.models.filter((m) => m.provider === p.id);
        const chosen = all.filter((m) =>
          enabled().has(modelKey(m.provider, m.id)),
        );
        const found = all.filter((m) =>
          words.every((w) => `${m.name} ${m.id}`.toLowerCase().includes(w)),
        );
        const big = all.length > 40;
        const list = words.length ? found : big ? chosen : all;
        const shown = list.slice(0, 100);
        return {
          ...p,
          all,
          shown,
          chosen: chosen.length,
          hidden:
            words.length || !big
              ? list.length - shown.length
              : all.length - chosen.length,
        };
      });
    },
    { name: 'settingsGroups' },
  );
  const hasKey = () =>
    catalog().providers.some((p) => p.id === catalog().settings.model.provider);

  const toggle = (key: string, on: boolean) => {
    const next = new Set(enabled());
    if (on) next.add(key);
    else next.delete(key);
    void updateSettings({ enabled: [...next] });
  };

  return (
    <>
      <Title>Settings · Bica</Title>
      <TopBar>
        <h1 class="truncate font-semibold">Settings</h1>
      </TopBar>
      <div class="flex-1 overflow-y-auto overscroll-contain border-t border-line">
        <div class="chat-column flex flex-col gap-6 py-8">
          <Card title="Appearance" footer="Saved on this device.">
            <Setting label="Theme" hint="System follows your device.">
              <Segmented>
                <For each={THEMES}>
                  {(t) => (
                    <button
                      class={segmentClass}
                      data-on={theme() === t.value ? '' : undefined}
                      aria-pressed={theme() === t.value ? 'true' : 'false'}
                      onClick={() => setTheme(t.value)}
                    >
                      {t.label}
                    </button>
                  )}
                </For>
              </Segmented>
            </Setting>
            <Setting
              label="Motion"
              hint="System follows your device's reduce motion setting. Full animates here even when it's on."
            >
              <Segmented>
                <For each={MOTIONS}>
                  {(m) => (
                    <button
                      class={segmentClass}
                      data-on={motion() === m.value ? '' : undefined}
                      aria-pressed={motion() === m.value ? 'true' : 'false'}
                      onClick={() => setMotion(m.value)}
                    >
                      {m.label}
                    </button>
                  )}
                </For>
              </Segmented>
            </Setting>
            <Toggle
              label="Hide thinking"
              hint="Leave the model's thinking out of transcripts. Tool calls still show."
              checked={hideThinking()}
              onChange={setHideThinking}
            />
            <Toggle
              label="Sounds"
              hint={
                <>
                  A chime when a session finishes, a double tap when it asks you
                  something, a low one when it fails. During a call, Groove
                  Salad from{' '}
                  <a
                    class="underline hover:text-fg"
                    href="https://somafm.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    SomaFM
                  </a>{' '}
                  while the agent works.
                </>
              }
              checked={soundOn()}
              onChange={setSoundOn}
            />
          </Card>

          <Card title="Models">
            <Show when={!hasKey()}>
              <div class="p-2">
                <Alert>
                  The default model's provider has no key. Connect it under
                  Accounts or pick another model.
                </Alert>
              </div>
            </Show>
            <Setting
              label="New sessions"
              hint={
                <>
                  The model and effort a session starts with.
                  <Show when={catalog().fromEnv.model}>
                    {' '}
                    Not picked yet: using <code>PI_MODEL</code> from the
                    environment.
                  </Show>
                </>
              }
            >
              <ModelPicker
                provider
                value={{
                  model: catalog().settings.model,
                  thinkingLevel: catalog().settings.thinkingLevel,
                }}
                onChange={(choice) => void updateSettings(choice)}
              />
            </Setting>
            <Setting
              label="Fast model"
              hint={
                <>
                  A small, cheap model that titles sessions and drafts commit
                  messages. Without one, titles are the prompt's first words.
                  <Show when={catalog().fromEnv.fastModel}>
                    {' '}
                    Using <code>PI_FAST_MODEL</code> from the environment.
                  </Show>
                </>
              }
            >
              <ModelPicker
                provider
                effort={false}
                empty="None"
                value={
                  catalog().settings.fastModel
                    ? {
                        model: catalog().settings.fastModel!,
                        thinkingLevel: 'off',
                      }
                    : undefined
                }
                onChange={(c) => void updateSettings({ fastModel: c.model })}
              />
              <Show when={catalog().settings.fastModel}>
                <Button
                  size="sm"
                  onClick={() => void updateSettings({ fastModel: null })}
                >
                  Clear
                </Button>
              </Show>
            </Setting>
            <div id="hub">
              <Setting
                label="Hub"
                hint="The session that coordinates the others. It keeps its memory as notes in this folder, such as a folder in your notes vault. Unset, it runs Claude Sonnet 5.5 through Anthropic at low effort."
              >
                <div class="flex flex-col items-end gap-1 max-sm:items-start">
                  <Input
                    class="h-8 w-64 max-w-full touch:h-11"
                    placeholder="~/Vault/Hub"
                    aria-label="Hub folder"
                    value={catalog().settings.hubFolder ?? ''}
                    onChange={(e) =>
                      void updateSettings({
                        hubFolder: e.currentTarget.value || null,
                      }).catch((error: unknown) =>
                        toast(
                          error instanceof Error
                            ? error.message
                            : String(error),
                        ),
                      )
                    }
                  />
                  <div class="flex items-center gap-1">
                    <ModelPicker
                      provider
                      empty="Unset"
                      value={catalog().settings.hubModel ?? undefined}
                      onChange={(hubModel) => void updateSettings({ hubModel })}
                    />
                    <Show when={catalog().settings.hubModel}>
                      <Button
                        size="sm"
                        onClick={() => void updateSettings({ hubModel: null })}
                      >
                        Clear
                      </Button>
                    </Show>
                  </div>
                </div>
              </Setting>
            </div>
          </Card>

          <Card
            title="In the model picker"
            description={
              enabled().size
                ? `${enabled().size} chosen. The picker offers only these.`
                : `None chosen, so the picker offers all ${catalog().models.length}. Choose your favorites to shorten it.`
            }
            bare={
              <div class="flex flex-col gap-1">
                <label class="flex h-10 items-center gap-2 rounded-sheet border border-line bg-surface px-3.5 text-muted transition-[border-color,box-shadow] focus-within:border-line-strong focus-within:ring-3 focus-within:ring-accent/12 touch:h-11">
                  <SearchIcon />
                  <input
                    class="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-muted touch:text-read"
                    type="search"
                    aria-label="Search all models"
                    placeholder="Search all models…"
                    value={filter()}
                    onInput={(e) => setFilter(e.currentTarget.value)}
                  />
                </label>
                <For each={groups()}>
                  {(g) => (
                    <Show when={g.all.length}>
                      <details
                        class="group/models rounded-sheet border border-line bg-surface"
                        open={filter() ? true : undefined}
                      >
                        <Summary class="h-10 px-3.5 text-fg touch:h-11">
                          <Chevron class="text-muted group-open/models:rotate-90" />
                          <span class="flex-1 font-medium">{g.name}</span>
                          <span class="text-meta text-muted tabular-nums">
                            {g.chosen} of {g.all.length}
                          </span>
                        </Summary>
                        <ul class="flex max-h-96 flex-col overflow-y-auto overscroll-contain border-t border-line p-1">
                          <For each={g.shown}>
                            {(m) => (
                              <li>
                                <label class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-hover touch:py-3">
                                  <input
                                    type="checkbox"
                                    class="accent-accent"
                                    checked={enabled().has(
                                      modelKey(m.provider, m.id),
                                    )}
                                    onChange={(e) =>
                                      toggle(
                                        modelKey(m.provider, m.id),
                                        e.currentTarget.checked,
                                      )
                                    }
                                  />
                                  <span class="flex-1 truncate">{m.name}</span>
                                  <span class="truncate font-mono text-meta text-muted">
                                    {m.id}
                                  </span>
                                </label>
                              </li>
                            )}
                          </For>
                          <Show when={g.hidden}>
                            <li class="px-2 py-2 text-meta text-muted">
                              {g.hidden} more. Search to find them.
                            </li>
                          </Show>
                        </ul>
                      </details>
                    </Show>
                  )}
                </For>
              </div>
            }
          />

          <Card title="Behavior">
            <Toggle
              label="Keep the cache for an hour"
              hint="The context stays cached through breaks of up to an hour instead of 5 minutes, so coming back doesn't resend it all. Cache writes cost 2x input instead of 1.25x. Some OpenAI models keep it 24 hours instead."
              checked={catalog().settings.longCache}
              onChange={(on) => void updateSettings({ longCache: on })}
            />
            <Toggle
              label="Stage on view"
              hint="Opening a diff under Changes stages the file. Staged is what you reviewed; whatever the agent writes after shows up under Changes again."
              checked={catalog().settings.stageOnView}
              onChange={(on) => void updateSettings({ stageOnView: on })}
            />
          </Card>

          <Accounts />

          <ProxySettings />

          <Show when={import.meta.env.DEV}>
            <Card
              title="Test data"
              description="Reopens Bica on made-up data, to see how screens hold up with long names, huge lists, or nothing at all. Real sessions are left alone, and commands aren't sent. Only in development, for this tab."
              bare={
                <div class="px-2 pb-2">
                  <Segmented class="self-start">
                    <For each={[undefined, ...MODES]}>
                      {(m) => (
                        <button
                          class={segmentClass}
                          data-on={testMode() === m ? '' : undefined}
                          aria-pressed={testMode() === m ? 'true' : 'false'}
                          onClick={() => openWithTestData(m)}
                        >
                          {m ? MODE_LABELS[m] : 'Off'}
                        </button>
                      )}
                    </For>
                  </Segmented>
                </div>
              }
            />
          </Show>
        </div>
      </div>
    </>
  );
}
