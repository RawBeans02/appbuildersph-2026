import { useSyncExternalStore } from 'react'
import { onLockChange, session } from '../../data/db/vault'
import { PHASE2 } from '../../lib/phase2'
import { createIdleLock } from './idleLock'
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

// Another tab changed the lock (a new PIN, a reset, an erase): a key that no
// longer fits is dropped here, and the screen follows the stored lock.
onLockChange((message) => {
  if (message.lockId !== session.lockId()) session.clear()
  void lock.refresh()
})

// Locks after 5 minutes in the background.
const idle = createIdleLock({ lockNow: () => void lock.lockNow() })
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? idle.hidden() : idle.shown()))
  window.addEventListener('pagehide', () => idle.hidden())
  window.addEventListener('pageshow', () => idle.shown())
}

export function useLock(): LockView {
  return useSyncExternalStore(lock.subscribe, lock.getView, lock.getView)
}

// Phone screens only: the municipal laptop keeps no personal records (its
// stores hold de-identified counts), so /municipal isn't behind the PIN.
// Neither is phase 2's DOH view (/doh), which keeps nothing on the device.
export const isLockedPath = (path: string) => !path.startsWith('/municipal') && path !== '/doh'
