// Locks the records after the app has been in the background (another app,
// the screen off, a closed tab kept in memory) for IDLE_LOCK_MS. A timer
// covers a page that keeps running hidden; the time check on return covers a
// page the browser froze, whose timers didn't run.
export const IDLE_LOCK_MS = 5 * 60_000

export type IdleLockDeps = {
  lockNow: () => void
  now?: () => number
  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (timer: unknown) => void
}

export function createIdleLock({
  lockNow,
  now = Date.now,
  setTimer = (run, ms) => setTimeout(run, ms),
  clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: IdleLockDeps) {
  let hiddenAt: number | null = null
  let timer: unknown = null
  return {
    hidden() {
      if (hiddenAt !== null) return
      hiddenAt = now()
      timer = setTimer(lockNow, IDLE_LOCK_MS)
    },
    shown() {
      if (timer !== null) clearTimer(timer)
      timer = null
      if (hiddenAt !== null && now() - hiddenAt >= IDLE_LOCK_MS) lockNow()
      hiddenAt = null
    },
  }
}
