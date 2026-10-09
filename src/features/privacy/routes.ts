import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [{ path: '/privacy', title: 'Privacy & AI', load: () => import('./PrivacyPage') }]
