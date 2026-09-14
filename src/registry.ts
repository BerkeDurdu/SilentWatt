import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { ScreenKey } from '../shared/types';

/**
 * Screen code is split per screen and only downloaded when a user who has that screen opens it.
 * Access itself is enforced by the API: without the screen, every data call answers 404.
 */
export const registry: Record<ScreenKey, LazyExoticComponent<ComponentType>> = {
  overview: lazy(() => import('./screens/Overview')),
  queue: lazy(() => import('./screens/Queue')),
  team: lazy(() => import('./screens/Team')),
  reports: lazy(() => import('./screens/Reports')),
  data: lazy(() => import('./screens/DataSources')),
  users: lazy(() => import('./screens/Users')),
  jobs: lazy(() => import('./screens/Jobs')),
};
