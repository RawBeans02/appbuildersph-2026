import { useSyncExternalStore } from 'react'
import { PHASE2 } from '../../lib/phase2'
import { createLockController, type LockView } from './lock'

// The app's one lock. The database code loads only when phase 2 is on, so the
// offline core's first load doesn't carry it.
export const lock = createLockController({
  phase2: PHASE2,
  getDb: async () => (await import('../../data/db/appDb')).getDb(),
  forgetRecords: async (db) => (await import('./forget')).forgetRecords(db),
})

// Mirrored on <html data-lock-status> for the e2e tests, independent of copy.
function mirror() {
  document.documentElement.dataset.lockStatus = lock.getView().status
}
lock.subscribe(mirror)
mirror()

export function useLock(): LockView {
  return useSyncExternalStore(lock.subscribe, lock.getView, lock.getView)
}

// Phone screens only: the municipal laptop keeps no personal records (its
// stores hold de-identified counts), so /municipal isn't behind the PIN.
// Neither is phase 2's DOH view (/doh), which keeps nothing on the device.
export const isLockedPath = (path: string) => !path.startsWith('/municipal') && path !== '/doh'
