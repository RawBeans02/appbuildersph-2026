import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ path: '/', title: 'AgapayMo', load: () => import('./HomePage') }]
