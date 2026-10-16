import { Title } from '@solidjs/meta';
import { useLocation, type RouteProps } from '@solidjs/router';
import { Show, createMemo } from 'solid-js';

import OpenFile from '../../components/OpenFile';
import PullRequestBadge from '../../components/PullRequestBadge';
import TopBar from '../../components/TopBar';
import WorkspaceOverview from '../../components/WorkspaceOverview';
import Empty from '../../components/ui/Empty';
import { workspaceName } from '#lib/projects';
import {
  openFromSearch,
  sameOpen,
  useCurrentWorkspace,
  workspaceHref,
} from '#lib/workspace';

export default function ProjectPage(_props: RouteProps<'/p/:id'>) {
  const location = useLocation();
  const current = useCurrentWorkspace();
  const open = createMemo(() => openFromSearch(location.search), {
    name: 'openFile',
    equals: sameOpen,
  });

  return (
    <Show
      when={current()}
      fallback={
        <>
          <TopBar />
          <Empty>Project not found</Empty>
        </>
      }
    >
      {(c) => {
        const name = () => workspaceName(c().project, c().workspace.path);
        return (
          <>
            <Title>{`${open()?.path.split('/').pop() ?? name()} · Bica`}</Title>
            <TopBar>
              <h1 class="truncate font-semibold">{name()}</h1>
              <Show when={c().workspace.branch}>
                <span class="truncate font-mono text-meta text-muted">
                  {c().workspace.branch}
                </span>
              </Show>
              <Show when={c().workspace.pr}>
                {(pr) => <PullRequestBadge pr={pr()} />}
              </Show>
            </TopBar>
            <Show
              when={open()}
              fallback={
                <WorkspaceOverview
                  project={c().project}
                  workspace={c().workspace}
                  at={c().ref}
                />
              }
            >
              {(o) => (
                <div class="flex min-h-0 flex-1 flex-col border-t border-line">
                  <OpenFile
                    workspace={c()}
                    open={o()}
                    href={(x) => workspaceHref(c().ref, x)}
                  />
                </div>
              )}
            </Show>
          </>
        );
      }}
    </Show>
  );
}
