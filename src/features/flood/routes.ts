import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [
  { path: '/watch', title: 'Flood exposure watch', load: () => import('./WatchPage') },
]
