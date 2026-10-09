import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ path: '/stock', title: 'Medicine stock', load: () => import('./StockPage') }]
