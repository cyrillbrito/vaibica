// Its own module so App.tsx and components (typed `paths`) share one instance.
import { pageRoutes } from 'virtual:file-routes';
import { createRouter } from '@solidjs/router';
import { fileRoutes } from '@solidjs/router/fs';

export const Router = createRouter({ routes: fileRoutes(pageRoutes) });

export const { paths } = Router;
