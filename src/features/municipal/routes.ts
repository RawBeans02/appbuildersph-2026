import type { AppRoute } from '../../app/routes'

export const routes: AppRoute[] = [
  { path: '/municipal', title: 'Barangay reports', load: () => import('./ScanPage') },
  { path: '/municipal/merged', title: 'Merged view', load: () => import('./MergedPage') },
  { path: '/municipal/plan', title: 'Plan', load: () => import('./PlanPage') },
  { path: '/municipal/log', title: 'Approval log', load: () => import('./LogPage') },
]
