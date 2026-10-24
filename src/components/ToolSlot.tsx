import { dynamic } from '@solidjs/web';
import { Errored, Loading, Show } from 'solid-js';

import type { ToolRowProps } from '#extensions/contract';
import { toolRow, useEnabled } from '#lib/extensions';
import ToolCalls from './ToolCalls';

/**
 * The `transcript.tool` slot: the row an extension draws for a call. The
 * generic tool row stands in while it's off, and when its row throws.
 */
export default function ToolSlot(props: ToolRowProps) {
  const enabled = useEnabled();
  const Row = dynamic(() => toolRow(enabled(), props.call.name));
  const generic = () => (
    <>
      <ToolCalls calls={[props.call]} />
      <Show when={props.answer}>
        {(answer) => <p class="text-ui whitespace-pre-wrap">{answer()}</p>}
      </Show>
    </>
  );
  return (
    <Show when={toolRow(enabled(), props.call.name)} fallback={generic()}>
      <Errored
        fallback={(error) => {
          console.error(`[extension] ${props.call.name} row:`, error());
          return generic();
        }}
      >
        <Loading>
          <Row {...props} />
        </Loading>
      </Errored>
    </Show>
  );
}
