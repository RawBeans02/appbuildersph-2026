import type { AgapayDb } from '../../data/db/db'
import { createLock, keyForPin, PBKDF2_ITERATIONS, session, wrongPinDelayMs } from '../../data/db/vault'

// The PIN lock in front of the phone's records (phase 2). The data layer
// seals the personal fields (src/data/db/vault.ts); this decides what the
// screen shows: set a PIN, enter it, or the app. The key stays in this page's
// memory only, so every reload starts locked.

export type LockView =
  // Phase 2 is off: no lock, nothing sealed.
  | { status: 'off' }
  | { status: 'checking' }
  // No PIN yet (a phone with no sample data).
  | { status: 'setup'; busy: boolean }
  | {
      status: 'locked'
      // Shown on the lock screen for sample data, else null.
      demoPin: string | null
      busy: boolean
      // The last try was wrong.
      wrong: boolean
      // Wrong-PIN wait: no tries before this time (ms since the epoch).
      waitUntil: number
    }
  | { status: 'unlocked' }

export type UnlockResult = 'ok' | 'wrong' | 'wait'

export type LockDeps = {
  phase2: boolean
  getDb: () => Promise<AgapayDb>
  // Wipes the records after "Forgot the PIN?": sample data comes back sealed
  // with the demo PIN, or, with no sample data, the phone is empty.
  forgetRecords: (db: AgapayDb) => Promise<void>
  now?: () => number
  iterations?: number
}

export function createLockController({ phase2, getDb, forgetRecords, now = Date.now, iterations = PBKDF2_ITERATIONS }: LockDeps) {
  let view: LockView = phase2 ? { status: 'checking' } : { status: 'off' }
  const listeners = new Set<() => void>()
  const set = (next: LockView) => {
    view = next
    listeners.forEach((listener) => listener())
  }

  // The locked or setup view from what's stored.
  async function readView(wrong = false): Promise<LockView> {
    if (session.key()) return { status: 'unlocked' }
    const db = await getDb()
    const lock = await db.getLock()
    if (!lock) return { status: 'setup', busy: false }
    const attempts = await db.getLockAttempts()
    return { status: 'locked', demoPin: lock.demoPin, busy: false, wrong, waitUntil: attempts.waitUntil }
  }

  return {
    getView: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    async init(): Promise<void> {
      if (!phase2) return
      set(await readView())
    },

    async unlock(pin: string): Promise<UnlockResult> {
      if (view.status !== 'locked' || view.busy) return 'wait'
      const db = await getDb()
      const attempts = await db.getLockAttempts()
      if (attempts.waitUntil > now()) {
        set({ ...view, waitUntil: attempts.waitUntil })
        return 'wait'
      }
      set({ ...view, busy: true, wrong: false })
      const lock = await db.getLock()
      const key = lock ? await keyForPin(lock, pin) : null
      if (!key) {
        const failures = attempts.failures + 1
        const waitUntil = now() + wrongPinDelayMs(failures)
        await db.putLockAttempts({ failures, waitUntil })
        set({ status: 'locked', demoPin: lock?.demoPin ?? null, busy: false, wrong: true, waitUntil })
        return 'wrong'
      }
      await db.putLockAttempts({ failures: 0, waitUntil: 0 })
      session.set(key)
      set({ status: 'unlocked' })
      return 'ok'
    },

    // First PIN on this phone: any records already here are sealed with it.
    async setPin(pin: string): Promise<void> {
      if (view.status !== 'setup' || view.busy) return
      set({ status: 'setup', busy: true })
      try {
        const db = await getDb()
        const { lock, key } = await createLock(pin, { iterations })
        session.set(key)
        await db.sealExisting()
        await db.putLock(lock)
        await db.putLockAttempts({ failures: 0, waitUntil: 0 })
        set({ status: 'unlocked' })
      } catch (error) {
        session.clear()
        set({ status: 'setup', busy: false })
        throw error
      }
    },

    // "Forgot the PIN?", after the person confirms: the records can't be
    // opened without it, so they're erased. Downloaded models stay.
    async forget(): Promise<void> {
      session.clear()
      const db = await getDb()
      await forgetRecords(db)
      set(await readView())
    },

    // After "Reset sample data" (which seals the sample again with the demo
    // PIN and keeps this page unlocked) or anything else that changed the lock.
    async refresh(): Promise<void> {
      if (!phase2) return
      set(await readView())
    },
  }
}

export type LockController = ReturnType<typeof createLockController>
