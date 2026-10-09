import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ path: '/device', title: 'Device check', load: () => import('./DevicePage') }]
