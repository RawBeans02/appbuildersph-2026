import type { AppRoute } from '../../app/routes'
import { PHASE2 } from '../../lib/phase2'

export const routes: AppRoute[] = [
  { path: '/municipal', title: 'Barangay reports', load: () => import('./ScanPage') },
  { path: '/municipal/merged', title: 'Merged view', load: () => import('./MergedPage') },
  { path: '/municipal/plan', title: 'Plan', load: () => import('./PlanPage') },
  { path: '/municipal/log', title: 'Approval log', load: () => import('./LogPage') },
  // Phase 2 only: without VITE_PHASE2 the path doesn't exist (the 404).
  ...(PHASE2 ? [{ path: '/municipal/sync', title: 'Sync', load: () => import('./sync/SyncPage') }] : []),
]
