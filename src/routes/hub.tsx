import { Title } from '@solidjs/meta';
import { useNavigate } from '@solidjs/router';
import { Show, createEffect, onSettled } from 'solid-js';

import HubBoard from '../components/hub/HubBoard';
import HubChat from '../components/hub/HubChat';
import StatusDot from '../components/StatusDot';
import VoiceSettings from '../components/VoiceSettings';
import TopBar from '../components/TopBar';
import { IconButton } from '../components/ui/Button';
import Empty from '../components/ui/Empty';
import { openContextMenu } from '../components/ui/ContextMenu';
import { toast } from '../components/ui/Toast';
import { HubIcon, SettingsIcon, VoiceIcon } from '../components/ui/icons';
import { setNoPanels } from '#lib/layout';
import { request } from '#lib/socket';
import { useHub } from '#lib/sessions';
import { paths } from '../router';

/**
 * The hub's own page (docs/hub.md): its board on top, the chat below.
 * The first visit starts it, or opens Settings when it has no folder yet.
 */
export default function Hub() {
  const hub = useHub();
  const navigate = useNavigate();
  onSettled(() => {
    setNoPanels(true);
    return () => setNoPanels(false);
  });
  let starting = false;
  createEffect(
    () => !hub(),
    (missing) => {
      if (!missing || starting) return;
      starting = true;
      request('hub.open', {}).catch((error: unknown) => {
        toast(error instanceof Error ? error.message : String(error));
        navigate(`${paths.settings()}#hub`, { replace: true });
      });
    },
    { name: 'startHub' },
  );

  // The user mostly talks to the hub by voice, so its voice is set here.
  let voiceDialog: HTMLDialogElement | undefined;
  const menu = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openContextMenu(r.right - 200, r.bottom + 4, [
      {
        label: 'Voice settings',
        icon: <VoiceIcon />,
        disabled: !hub() && 'The hub is starting',
        onSelect: () => voiceDialog?.showModal(),
      },
      {
        label: 'Hub folder and model',
        icon: <SettingsIcon />,
        onSelect: () => navigate(`${paths.settings()}#hub`),
      },
    ]);
  };

  return (
    <>
      <Title>Hub</Title>
      <TopBar
        actions={
          <IconButton title="Hub settings" aria-haspopup="menu" onClick={menu}>
            <SettingsIcon />
          </IconButton>
        }
      >
        <span class="text-accent">
          <HubIcon />
        </span>
        <h1 class="font-semibold">Hub</h1>
        <Show when={hub() && hub()!.status !== 'idle' && hub()!.status}>
          {(status) => <StatusDot status={status()} />}
        </Show>
      </TopBar>
      <Show when={hub()} fallback={<Empty>Starting the hub…</Empty>}>
        {(h) => (
          <>
            <HubBoard hubId={h().id} />
            <HubChat id={h().id} />
            <VoiceSettings
              id={h().id}
              voice={h().voice}
              ref={(el) => (voiceDialog = el)}
            />
          </>
        )}
      </Show>
    </>
  );
}
