import type { AppRoute } from '../../app/routes'
import { PHASE2 } from '../../lib/phase2'

// Phase 2 only: without VITE_PHASE2, /doh doesn't exist (the 404).
export const routes: AppRoute[] = PHASE2 ? [{ path: '/doh', title: 'DOH view', load: () => import('./DohPage') }] : []
