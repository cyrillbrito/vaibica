import { useLocation, useNavigate } from '@solidjs/router';
import { Show, createMemo } from 'solid-js';

import {
  contextMenu,
  MenuButton,
  type MenuEntry,
} from '../../components/ui/ContextMenu';
import {
  CloseIcon,
  CopyIcon,
  ExternalIcon,
  RestoreIcon,
  StopIcon,
  TerminalIcon,
} from '../../components/ui/icons';
import { copyText } from '#lib/clipboard';
import { closeDrawer } from '#lib/layout';
import type { TerminalInfo } from './protocol';
import {
  removeTerminal,
  restartTerminal,
  stopTerminal,
  terminalHref,
  useTerminals,
} from './socket';

/** One terminal in its workspace's group (the `sidebar.workspace` slot). */
export default function SidebarRow(props: { id: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const terminals = useTerminals();
  const info = createMemo(() => terminals().find((t) => t.id === props.id), {
    name: 'terminalRow',
  });

  const close = async (t: TerminalInfo) => {
    if (location.pathname === terminalHref(t.id)) navigate('/');
    await removeTerminal(t.id);
  };

  const menu = (t: TerminalInfo): MenuEntry[] => [
    t.status === 'running'
      ? {
          label: 'Stop',
          icon: <StopIcon />,
          onSelect: () => void stopTerminal(t.id),
        }
      : {
          label: 'Restart',
          icon: <RestoreIcon />,
          onSelect: () => void restartTerminal(t.id),
        },
    {
      label: 'Close',
      icon: <CloseIcon />,
      onSelect: () => void close(t),
    },
    'separator',
    {
      label: 'Open in new tab',
      icon: <ExternalIcon />,
      onSelect: () => window.open(terminalHref(t.id), '_blank'),
    },
    ...(t.command
      ? ([
          {
            label: 'Copy command',
            icon: <CopyIcon />,
            onSelect: () => void copyText(t.command!),
          },
        ] satisfies MenuEntry[])
      : []),
  ];

  return (
    <Show when={info()}>
      {(t) => {
        const state = () =>
          t().status === 'running'
            ? 'Running'
            : `Exited with code ${t().exitCode}`;
        return (
          <div
            class="context-target relative rounded-md"
            {...contextMenu(() => menu(t()))}
          >
            <a
              class="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-hover aria-[current=page]:bg-active touch:py-3 touch:pr-11"
              href={terminalHref(t().id)}
              title={t().command ? `${state()}: ${t().command}` : state()}
              onClick={closeDrawer}
            >
              <span
                class={[
                  // Icon width minus the status dot's, so titles line up.
                  '-mx-0.75',
                  t().status === 'running'
                    ? 'text-running'
                    : t().exitCode
                      ? 'text-danger'
                      : 'text-muted',
                ]}
                role="img"
                aria-label={state()}
              >
                <TerminalIcon />
              </span>
              <span
                class={[
                  'flex-1 truncate',
                  t().status !== 'running' && 'text-muted',
                ]}
              >
                {t().title}
              </span>
              <Show when={t().status !== 'running'}>
                <span class="text-meta text-muted tabular-nums">
                  exit {t().exitCode}
                </span>
              </Show>
            </a>
            <MenuButton
              class="absolute inset-y-0 right-0.5 my-auto hidden touch:grid"
              items={() => menu(t())}
            />
          </div>
        );
      }}
    </Show>
  );
}
