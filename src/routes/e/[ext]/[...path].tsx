import type { RouteProps } from '@solidjs/router';
import { Dynamic } from '@solidjs/web';
import { Errored, createMemo } from 'solid-js';

import TopBar from '../../../components/TopBar';
import Empty from '../../../components/ui/Empty';
import Failed from '../../../components/ui/Failed';
import { extensionPage, useEnabled } from '#lib/extensions';

function NotFound() {
  return (
    <>
      <TopBar />
      <Empty>Page not found</Empty>
    </>
  );
}

// Every extension's pages, under its own prefix, like Grafana's app pages at
// `/a/<plugin-id>/`: the route table stays the same whatever is installed,
// and an extension owns everything below its prefix (docs/extensions.md).
export default function ExtensionPageRoute(props: RouteProps<'/e/:ext/*path'>) {
  const enabled = useEnabled();
  const found = createMemo(
    () => extensionPage(enabled(), props.params.ext, props.params.path ?? ''),
    { name: 'extensionPage' },
  );
  return (
    <Errored fallback={(error) => <Failed error={error()} />}>
      <Dynamic
        component={found()?.Page ?? NotFound}
        params={found()?.params ?? {}}
      />
    </Errored>
  );
}
