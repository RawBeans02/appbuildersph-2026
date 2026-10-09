import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ path: '/compare', title: 'Exposure and stock', load: () => import('./ComparePage') }]
