import { Show } from 'solid-js';

import type { SessionSummary } from '#lib/protocol';
import { paths } from '../router';
import { Button } from './ui/Button';
import { ParentIcon, TakeOverIcon } from './ui/icons';

/**
 * A line on the composer's tray of a session another one started: who is in
 * charge, a link to the parent, and Hand back once it's you. The parent's
 * title stays out of sentences, since titles run long.
 */
export default function ParentStrip(props: {
  parent: SessionSummary | undefined;
  parentDrives: boolean;
  onHandBack: () => void;
}) {
  return (
    <div class="appear flex min-h-8 items-center gap-x-2 rounded-lg py-0.5 pr-1 pl-1.5 touch:min-h-11">
      <span
        class={[
          'flex shrink-0 items-center gap-1 text-meta [&_svg]:size-3.5',
          props.parentDrives ? 'text-accent-ink' : 'text-muted',
        ]}
      >
        {props.parentDrives ? <ParentIcon /> : <TakeOverIcon />}
        {props.parentDrives ? 'Parent in charge' : "You're in charge"}
      </span>
      <a
        class="min-w-0 flex-1 truncate text-muted hover:text-fg"
        href={props.parent ? paths.s(props.parent.id)() : undefined}
        title={props.parent?.title ? `Open ${props.parent.title}` : undefined}
      >
        {props.parent?.title || 'Untitled session'}
      </a>
      <Show when={!props.parentDrives}>
        <Button
          size="sm"
          variant="outline"
          title="The parent session is in charge again and hears its replies"
          onClick={() => props.onHandBack()}
        >
          <ParentIcon />
          Hand back
        </Button>
      </Show>
    </div>
  );
}
