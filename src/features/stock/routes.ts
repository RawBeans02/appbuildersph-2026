import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ path: '/stock', title: 'Stock', load: () => import('./StockPage') }]
