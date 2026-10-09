import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ path: '/hinga', title: 'Hinga breathing check', load: () => import('./HingaPage') }]
