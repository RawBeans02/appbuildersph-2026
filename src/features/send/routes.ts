import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ path: '/send', title: 'Send to the RHU', load: () => import('./SendPage') }]
