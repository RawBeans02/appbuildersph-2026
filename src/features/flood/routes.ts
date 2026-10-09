import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [
  { path: '/watch', title: 'Watch list', load: () => import('./WatchPage') },
]
