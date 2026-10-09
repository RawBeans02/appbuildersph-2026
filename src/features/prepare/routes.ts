import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ path: '/prepare', title: 'Prepare for offline', load: () => import('./PreparePage') }]
