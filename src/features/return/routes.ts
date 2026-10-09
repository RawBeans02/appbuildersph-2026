import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [
  { path: '/receive', title: 'Receive RHU instructions', load: () => import('./ReceivePage') },
  { path: '/municipal/return', title: 'Return instructions QR', load: () => import('./ReturnPage') },
]
