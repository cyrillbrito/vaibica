import { Title } from '@solidjs/meta';
import { useNavigate, type RouteProps } from '@solidjs/router';
import { Show, createMemo } from 'solid-js';

import TerminalView from '../../components/TerminalView';
import TopBar from '../../components/TopBar';
import { Button } from '../../components/ui/Button';
import Empty from '../../components/ui/Empty';
import { Tag } from '../../components/ui/Tag';
import {
  RestoreIcon,
  StopIcon,
  CloseIcon,
  TerminalIcon,
} from '../../components/ui/icons';
import { useProjects, workspaceName } from '#lib/projects';
import { useSessions } from '#lib/sessions';
import {
  removeTerminal,
  restartTerminal,
  stopTerminal,
  useTerminals,
} from '#lib/terminals';
import { paths } from '../../router';

export default function TerminalPage(props: RouteProps<'/t/:id'>) {
  const navigate = useNavigate();
  const terminals = useTerminals();
  const projects = useProjects();
  const sessions = useSessions();
  const info = createMemo(
    () => terminals().find((t) => t.id === props.params.id),
    { name: 'terminalInfo' },
  );
  const where = () => {
    const t = info();
    const project = projects().find((p) => p.id === t?.projectId);
    return t && project ? workspaceName(project, t.cwd) : undefined;
  };
  const starter = () =>
    sessions().find((s) => s.id === info()?.startedBy) ?? undefined;

  const close = async (id: string) => {
    await removeTerminal(id);
    navigate(paths());
  };

  return (
    <Show
      when={info()}
      fallback={
        <>
          <TopBar />
          <Empty icon={<TerminalIcon />} title="Terminal closed">
            It's no longer running or listed. Open another from a workspace's
            menu in the sidebar.
          </Empty>
        </>
      }
    >
      {(t) => (
        <>
          <Title>{`${t().title} · Bica`}</Title>
          <TopBar
            actions={
              <>
                <Show
                  when={t().status === 'running'}
                  fallback={
                    <Button
                      size="md"
                      title="Run it again"
                      onClick={() => void restartTerminal(t().id)}
                    >
                      <RestoreIcon /> Restart
                    </Button>
                  }
                >
                  <Button
                    size="md"
                    title="Stop the process"
                    onClick={() => void stopTerminal(t().id)}
                  >
                    <StopIcon /> Stop
                  </Button>
                </Show>
                <Button
                  size="md"
                  title="Stop it and remove it from the list"
                  onClick={() => void close(t().id)}
                >
                  <CloseIcon /> Close
                </Button>
              </>
            }
          >
            <h1 class="truncate font-semibold">{t().title}</h1>
            {/* The sidebar's calm status tags: green while it runs, red on a failing exit. */}
            <Tag
              tone={
                t().status === 'running'
                  ? 'running'
                  : t().exitCode
                    ? 'danger'
                    : 'neutral'
              }
            >
              {t().status === 'running'
                ? 'Running'
                : `Exited ${t().exitCode ?? ''}`.trim()}
            </Tag>
            <Show when={where()}>
              <span class="truncate text-meta text-muted max-md:hidden">
                {where()}
              </span>
            </Show>
            <Show when={starter()}>
              {(s) => (
                <a
                  class="truncate text-meta text-muted underline-offset-2 hover:text-fg hover:underline max-md:hidden"
                  href={paths.s(s().id)}
                >
                  from {s().title || 'a session'}
                </a>
              )}
            </Show>
          </TopBar>
          {/* Keyed: another terminal gets a fresh screen. */}
          <Show when={t().id} keyed>
            {(id) => (
              <div class="flex min-h-0 flex-1 flex-col border-t border-line">
                <TerminalView id={id} />
              </div>
            )}
          </Show>
        </>
      )}
    </Show>
  );
}
