import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ path: '/', title: 'Agapay', load: () => import('./HomePage') }]
