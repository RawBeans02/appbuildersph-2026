import type { AppRoute } from './routes'

// Routes that belong to the app itself rather than to a feature.
export const coreRoutes: AppRoute[] = [
  { path: '/prepare', title: 'Prepare for offline', load: () => import('./PreparePage') },
  { path: '/device', title: 'Device check', load: () => import('./DevicePage') },
]
