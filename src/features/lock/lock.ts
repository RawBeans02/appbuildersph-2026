import type { AgapayDb } from '../../data/db/db'
import { createLock, DEMO_PIN, keyForPin, lockIdOf, PBKDF2_ITERATIONS, session, wrongPinDelayMs } from '../../data/db/vault'

// The PIN lock in front of the phone's records (phase 2). The data layer
// seals the personal fields (src/data/db/vault.ts); this decides what the
// screen shows: set a PIN, enter it, or the app. The key stays in this page's
// memory only, so every reload starts locked.

export type LockView =
  // No lock: phase 2 is off and no lock is stored.
  | { status: 'off' }
  | { status: 'checking' }
  // The records couldn't be opened (a retry may work).
  | { status: 'error'; message: string }
  // No PIN yet (a phone with no sample data).
  | { status: 'setup'; busy: boolean }
  | {
      status: 'locked'
      // Shown on the lock screen while every record is sample data, else null.
      demoPin: string | null
      busy: boolean
      // The last try was wrong.
      wrong: boolean
      // Wrong-PIN wait: no tries before this time (on the `now` clock,
      // performance.now() in the app, so the device clock can't skip it).
      waitUntil: number
    }
  // usingDemoPin: opened with the sample data PIN, so "Set your own PIN" is offered.
  | { status: 'unlocked'; usingDemoPin: boolean }

export type UnlockResult = 'ok' | 'wrong' | 'wait'

export type LockDeps = {
  phase2: boolean
  getDb: () => Promise<AgapayDb>
  // Wipes the records after "Forgot the PIN?": sample data comes back sealed
  // with the demo PIN, or, with no sample data, the phone is empty.
  forgetRecords: (db: AgapayDb) => Promise<void>
  // A monotonic clock in ms (performance.now in the app).
  now?: () => number
  iterations?: number
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function createLockController({
  phase2,
  getDb,
  forgetRecords,
  now = () => performance.now(),
  iterations = PBKDF2_ITERATIONS,
}: LockDeps) {
  let view: LockView = phase2 ? { status: 'checking' } : { status: 'off' }
  const listeners = new Set<() => void>()
  const set = (next: LockView) => {
    view = next
    listeners.forEach((listener) => listener())
  }
  // When this page started, and its last wrong try: the wait after a reload
  // runs again from the start, on this page's own clock.
  let startedAt = now()
  let lastWrongAt: number | null = null
  let usingDemoPin = false
  // Tries run one at a time.
  let queue: Promise<unknown> = Promise.resolve()

  const waitUntilFor = (failures: number) => (failures < 3 ? 0 : (lastWrongAt ?? startedAt) + wrongPinDelayMs(failures))

  // The view from what's stored.
  async function readView(wrong = false): Promise<LockView> {
    const db = await getDb()
    const lock = await db.getLock()
    if (!phase2 && !lock) return { status: 'off' }
    if (session.key() && lock && session.lockId() === lockIdOf(lock)) return { status: 'unlocked', usingDemoPin }
    session.clear()
    if (!lock) return { status: 'setup', busy: false }
    const { failures } = await db.getLockAttempts()
    return { status: 'locked', demoPin: lock.demoPin, busy: false, wrong, waitUntil: waitUntilFor(failures) }
  }

  async function show() {
    try {
      set(await readView())
    } catch (error) {
      set(phase2 ? { status: 'error', message: errorText(error) } : { status: 'off' })
    }
  }

  async function tryPin(pin: string): Promise<UnlockResult> {
    if (view.status !== 'locked') return 'wait'
    const db = await getDb()
    const { failures } = await db.getLockAttempts()
    const waitUntil = waitUntilFor(failures)
    if (waitUntil > now()) {
      set({ ...view, busy: false, waitUntil })
      return 'wait'
    }
    set({ ...view, busy: true, wrong: false })
    const lock = await db.getLock()
    // Counted before the slow derivation, so tries at the same moment each count.
    const counted = await db.bumpLockAttempts()
    const key = lock ? await keyForPin(lock, pin) : null
    if (!lock || !key) {
      lastWrongAt = now()
      set({ status: 'locked', demoPin: lock?.demoPin ?? null, busy: false, wrong: true, waitUntil: waitUntilFor(counted) })
      return 'wrong'
    }
    await db.resetLockAttempts()
    session.set(key, lockIdOf(lock))
    usingDemoPin = pin === DEMO_PIN
    lastWrongAt = null
    // Finishes sealing anything an interrupted save left plain.
    await db.sealExisting()
    set({ status: 'unlocked', usingDemoPin })
    return 'ok'
  }

  return {
    getView: () => view,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    // phase2 off: the lock stays out of the way unless a lock is stored (a
    // phone that ran a phase-2 build keeps its records sealed in any build).
    async init(): Promise<void> {
      startedAt = now()
      if (phase2) set({ status: 'checking' })
      await show()
    },

    unlock(pin: string): Promise<UnlockResult> {
      const run = queue.then(() => tryPin(pin))
      queue = run.catch(() => undefined)
      return run
    },

    // First PIN on this phone: the lock is saved first, then any records
    // already here are sealed with it (an interruption leaves them plain and
    // readable; the next unlock finishes the job).
    async setPin(pin: string): Promise<void> {
      if (view.status !== 'setup' || view.busy) return
      set({ status: 'setup', busy: true })
      try {
        const db = await getDb()
        const { lock, key } = await createLock(pin, { iterations })
        await db.putLock(lock)
        session.set(key, lockIdOf(lock))
        await db.resetLockAttempts()
        await db.sealExisting()
        usingDemoPin = pin === DEMO_PIN
        set({ status: 'unlocked', usingDemoPin })
      } catch (error) {
        session.clear()
        set({ status: 'setup', busy: false })
        throw error
      }
    },

    // "Set your own PIN" while unlocked: every record is sealed again with
    // the new PIN's key, in one transaction with the new lock.
    async changePin(pin: string): Promise<void> {
      if (view.status !== 'unlocked') throw new Error('Unlock first.')
      const db = await getDb()
      const { lock, key } = await createLock(pin, { iterations })
      await db.rekey(lock, key)
      usingDemoPin = pin === DEMO_PIN
      set({ status: 'unlocked', usingDemoPin })
    },

    // "Lock now", or after 5 minutes in the background.
    async lockNow(): Promise<void> {
      if (view.status !== 'unlocked') return
      session.clear()
      usingDemoPin = false
      await show()
    },

    // "Forgot the PIN?", after the person confirms: the records can't be
    // opened without it, so they're erased. Downloaded models stay.
    async forget(): Promise<void> {
      session.clear()
      usingDemoPin = false
      const db = await getDb()
      await forgetRecords(db)
      await show()
    },

    // After "Reset sample data", another tab's change, or a retry.
    async refresh(): Promise<void> {
      await show()
    },
  }
}

export type LockController = ReturnType<typeof createLockController>
