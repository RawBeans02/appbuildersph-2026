import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [
  { path: '/municipal', title: 'Municipal: scan barangay QRs', load: () => import('./ScanPage') },
  { path: '/municipal/plan', title: 'Municipal plan', load: () => import('./PlanPage') },
  { path: '/municipal/log', title: 'Approval log', load: () => import('./LogPage') },
]
