import { useLocation, useNavigate } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { Errored, Loading, Show, createMemo, createSignal } from 'solid-js';

import { closeDrawer } from '../ui/layout';
import { copyText } from '../ui/clipboard';
import type { GitStatus, WorkspaceRef } from '@bica/shared/protocol';
import {
  openFromSearch,
  openInEditor,
  useFiles,
  openHref,
} from '../files/files';
import { repos, useGitStatus } from '../git/git';
import { useCurrentWorkspace } from '../projects/projects';
import { TREE_STATUS, asList, toggleAsList } from '../files/ChangeList';
import FileTree from '../files/FileTree';
import GitPanel from '../git/GitPanel';
import { keepOpenItem } from '../files/OpenFile';
import { IconButton } from '../ui/Button';
import Empty from '../ui/Empty';
import { moveFocus } from '../ui/listKeys';
import Failed from '../ui/Failed';
import {
  CloseIcon,
  CodeIcon,
  CopyIcon,
  DiffIcon,
  FilesIcon,
  ListIcon,
  TreeIcon,
} from '../ui/icons';

type Tab = 'files' | 'git';

// Survives switching workspaces: you usually want the same kind of view.
const [tab, setTab] = createSignal<Tab>('git');

export default function SidePanel() {
  const location = useLocation();
  const current = useCurrentWorkspace();

  // Arrow keys move between the tabs, and only the picked one is in the Tab
  // order, as the ARIA tabs pattern has it.
  const TabButton = (props: { id: Tab; children: JSX.Element }) => (
    <button
      id={`side-tab-${props.id}`}
      class="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-muted transition-colors hover:text-fg aria-selected:bg-active aria-selected:text-fg touch:h-11"
      role="tab"
      aria-selected={tab() === props.id ? 'true' : 'false'}
      aria-controls="side-panel"
      tabindex={tab() === props.id ? 0 : -1}
      onClick={() => setTab(props.id)}
      onKeyDown={(e) =>
        moveFocus(
          e,
          [
            ...e.currentTarget.parentElement!.querySelectorAll<HTMLElement>(
              '[role=tab]',
            ),
          ],
          true,
        )?.click()
      }
    >
      {props.children}
    </button>
  );

  return (
    <aside
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-line bg-panel xl:border-l"
      aria-label="Workspace"
    >
      <header class="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2 touch:h-14">
        <div
          class="flex items-center gap-1"
          role="tablist"
          aria-label="Side panel"
        >
          <TabButton id="files">
            <FilesIcon /> Files
          </TabButton>
          <TabButton id="git">
            <DiffIcon /> Git
          </TabButton>
        </div>
        <Show when={tab() === 'git'}>
          <IconButton
            class="ml-auto"
            title={
              asList() ? 'Show changes as a tree' : 'Show changes as a list'
            }
            onClick={toggleAsList}
          >
            {asList() ? <TreeIcon /> : <ListIcon />}
          </IconButton>
        </Show>
        <IconButton
          class={[tab() !== 'git' && 'ml-auto', 'xl:hidden']}
          title="Close"
          onClick={closeDrawer}
        >
          <CloseIcon />
        </IconButton>
      </header>
      <Errored fallback={(error) => <Failed error={error()} />}>
        {/* Keyed so a new page's panel data blanks the panel instead of
            holding the whole navigation (see Page in App.tsx). */}
        <Loading on={[location.pathname, current()?.workspace.path]}>
          <Show
            when={current()}
            fallback={<Empty>Open a project or session to see its files</Empty>}
          >
            {(c) => <WorkspacePanel workspace={c().ref} />}
          </Show>
        </Loading>
      </Errored>
    </aside>
  );
}

function WorkspacePanel(props: { workspace: WorkspaceRef }) {
  const location = useLocation();
  const navigate = useNavigate();
  const status = useGitStatus(() => props.workspace);
  const files = useFiles(() => props.workspace);
  // Project and session pages open files; elsewhere nothing is selected.
  const open = createMemo(() =>
    /^\/[ps]\//.test(location.pathname)
      ? openFromSearch(location.search)
      : undefined,
  );

  return (
    <div
      id="side-panel"
      class="flex min-h-0 min-w-0 flex-1 flex-col"
      role="tabpanel"
      aria-labelledby={`side-tab-${tab()}`}
    >
      <Show when={tab() === 'files'}>
        <FileTree
          paths={files()}
          status={treeStatus(status())}
          selected={open()?.view === 'file' ? open()?.path : undefined}
          onOpen={(path) => {
            closeDrawer();
            navigate(openHref(props.workspace, { path, view: 'file' }));
          }}
          menu={(paths) => [
            ...keepOpenItem(
              navigate,
              props.workspace,
              paths.length === 1
                ? { path: paths[0]!, view: 'file' }
                : undefined,
            ),
            ...(paths.length === 1
              ? [
                  {
                    label: 'Open in editor',
                    icon: <CodeIcon />,
                    onSelect: () =>
                      void openInEditor(props.workspace, paths[0]),
                  },
                ]
              : []),
            {
              label: paths.length === 1 ? 'Copy path' : 'Copy paths',
              icon: <CopyIcon />,
              onSelect: () => void copyText(paths.join('\n')),
            },
          ]}
        />
      </Show>
      <Show when={tab() === 'git'}>
        <Show when={status()} fallback={<Empty>Not a git repository</Empty>}>
          {(s) => (
            <GitPanel workspace={props.workspace} status={s()} open={open()} />
          )}
        </Show>
      </Show>
    </div>
  );
}

// Unstaged wins: it's what the file on disk looks like now.
function treeStatus(status: GitStatus | null | undefined) {
  const map = new Map<string, (typeof TREE_STATUS)[keyof typeof TREE_STATUS]>();
  for (const c of (status ? repos(status) : []).flatMap((r) => [
    ...r.staged,
    ...r.unstaged,
  ]))
    map.set(c.path, TREE_STATUS[c.status]);
  return [...map].map(([path, status]) => ({ path, status }));
}
