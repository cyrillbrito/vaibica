import type { RouteDefinition } from '@solidjs/router';
import { httpStatus } from '@solidjs/web';

import TopBar from '../components/TopBar';
import Empty from '../components/ui/Empty';

// Runs in preload so the status is set before the response head flushes.
export const route = {
  preload: () => httpStatus(404),
} satisfies RouteDefinition;

export default function NotFound() {
  return (
    <>
      <TopBar />
      <Empty>Page not found</Empty>
    </>
  );
}
