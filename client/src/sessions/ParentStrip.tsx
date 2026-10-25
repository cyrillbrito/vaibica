import { Show } from 'solid-js';

import type { SessionSummary } from '@bica/shared/protocol';
import { paths } from '../router';
import { Button } from '../ui/Button';
import { ParentIcon, TakeOverIcon } from '../ui/icons';
import { Strip } from '../ui/Strip';

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
    <Strip
      tone={props.parentDrives ? 'accent' : 'muted'}
      icon={props.parentDrives ? <ParentIcon /> : <TakeOverIcon />}
      label={props.parentDrives ? 'Parent in charge' : "You're in charge"}
      action={
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
      }
    >
      <a
        class="min-w-0 truncate text-muted transition-colors hover:text-fg"
        href={props.parent ? paths.s(props.parent.id)() : undefined}
        title={props.parent?.title ? `Open ${props.parent.title}` : undefined}
      >
        {props.parent?.title || 'Untitled session'}
      </a>
    </Strip>
  );
}
