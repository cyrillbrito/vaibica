import { useLocation, useNavigate } from '@solidjs/router';
import { Show, createMemo, createSignal } from 'solid-js';

import type { WorkspaceRef } from '#lib/protocol';
import { clearComments, doneComments, reviewPrompt } from '#lib/review';
import { sendPrompt, useSessions } from '#lib/sessions';
import { paths } from '../router';
import { Button } from './ui/Button';
import { RollingNumber } from './ui/RollingNumber';
import { toast } from './ui/Toast';
import { CommentIcon, SendIcon } from './ui/icons';

/**
 * Prototype: the comments written on this workspace's diffs, sent to an
 * agent as one prompt. It goes to the open session, or on the workspace page
 * to the newest session in the workspace.
 */
export default function ReviewBar(props: { workspace: WorkspaceRef }) {
  const location = useLocation();
  const navigate = useNavigate();
  const sessions = useSessions();
  const [sending, setSending] = createSignal(false);
  const list = createMemo(() => doneComments(props.workspace.cwd));
  const target = createMemo(() => {
    const [, kind, id] = location.pathname.split('/');
    const all = sessions();
    if (kind === 's' && id)
      return all.find((s) => s.id === decodeURIComponent(id));
    return all
      .filter((s) => s.cwd === props.workspace.cwd && !s.archivedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  });

  const send = async () => {
    const t = target();
    if (!t) return;
    setSending(true);
    const n = list().length;
    const ok = await toast
      .promise(
        sendPrompt(t.id, reviewPrompt(list()), []),
        {
          loading: `Sending ${n} comment${n === 1 ? '' : 's'}…`,
          success: {
            title: `Sent to ${t.title || 'the session'}`,
            description: 'The agent works through them next.',
          },
          error: (e) => ({
            title: 'Not sent',
            description: e instanceof Error ? e.message : String(e),
          }),
        },
        {
          action: {
            label: 'Open',
            onClick: () => navigate(String(paths.s(t.id))),
          },
        },
      )
      .then(
        () => true,
        () => false,
      );
    setSending(false);
    if (ok) clearComments(props.workspace.cwd);
  };

  return (
    <Show when={list().length}>
      <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3 pb-[max(--spacing(3),env(safe-area-inset-bottom))]">
        <div class="appear pointer-events-auto flex max-w-full items-center gap-2 rounded-card bg-panel p-1 pl-3 shadow-menu">
          <span class="text-accent">
            <CommentIcon />
          </span>
          <span class="shrink-0 tabular-nums">
            <RollingNumber value={list().length} /> comment
            {list().length === 1 ? '' : 's'}
          </span>
          <span class="min-w-0 truncate text-meta text-muted max-sm:hidden">
            Prototype
          </span>
          <Button
            size="md"
            class="text-muted"
            onClick={() =>
              confirm('Delete every comment on this workspace?') &&
              clearComments(props.workspace.cwd)
            }
          >
            Discard
          </Button>
          <Button
            size="md"
            variant="primary"
            class="min-w-0"
            loading={sending()}
            disabled={!target()}
            title={
              target()
                ? `Send them as one prompt to ${target()!.title || 'the session'}`
                : 'Start a session in this workspace first'
            }
            onClick={() => void send()}
          >
            <SendIcon />
            <span class="truncate">Send to {target()?.title || 'agent'}</span>
          </Button>
        </div>
      </div>
    </Show>
  );
}
