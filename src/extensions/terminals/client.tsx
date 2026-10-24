import { useNavigate } from '@solidjs/router';
import { createMemo } from 'solid-js';

import { TerminalIcon } from '../../components/ui/icons';
import { closeDrawer } from '#lib/layout';
import { useProjects } from '#lib/projects';
import { defineClientExtension } from '../contract';
import { terminals as manifest } from './meta';
import { createTerminal, terminalHref, useTerminals } from './socket';

export default defineClientExtension({
  manifest,
  pages: [{ path: ':id', load: () => import('./TerminalPage') }],
  slots: [
    {
      slot: 'sidebar.workspace',
      use: () => {
        const navigate = useNavigate();
        const terminals = useTerminals();
        return {
          rows: terminals,
          menu: (workspace) => [
            {
              label: 'New terminal here',
              icon: <TerminalIcon />,
              onSelect: async () => {
                closeDrawer();
                navigate(terminalHref(await createTerminal(workspace)));
              },
            },
          ],
        };
      },
      load: () => import('./SidebarRow'),
    },
    {
      slot: 'palette.search',
      use: () => {
        const terminals = useTerminals();
        const projects = useProjects();
        return createMemo(
          () =>
            terminals().map((t) => ({
              id: `terminal:${t.id}`,
              label: t.title,
              hint: projects().find((p) => p.id === t.projectId)?.name,
              icon: TerminalIcon,
              href: terminalHref(t.id),
            })),
          { name: 'terminalPlaces' },
        );
      },
    },
  ],
  commands: [
    {
      id: 'terminals.new',
      title: 'New terminal',
      hint: (c) => c.workspaceName,
      words: 'shell console',
      icon: TerminalIcon,
      keys: { code: 'Backquote', ctrl: true },
      when: (c) => !!c.workspace,
      run: async (c) => {
        closeDrawer();
        c.navigate(terminalHref(await createTerminal(c.workspace!)));
      },
    },
  ],
});
