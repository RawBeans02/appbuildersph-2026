import { useEffect } from 'react'

// Keeps the screen on while a QR shows (design 14b), so the phone doesn't dim
// in front of the laptop's camera. Uses the Screen Wake Lock API where the
// browser has it; elsewhere, or if it's refused, the screen behaves as usual.

type Sentinel = { release(): Promise<void> }

export type WakeLockEnv = {
  // null when the browser has no Wake Lock API.
  request: (() => Promise<Sentinel>) | null
  isVisible: () => boolean
  onVisibilityChange: (listener: () => void) => () => void
}

const ignore = () => {}

// Holds a screen wake lock until the returned function is called. The browser
// drops the lock whenever the page is hidden, so it's asked for again each
// time the page is visible again.
export function keepScreenOn(env: WakeLockEnv): () => void {
  const { request } = env
  if (!request) return ignore
  let held: Sentinel | null = null
  let stopped = false

  const acquire = () => {
    if (stopped || !env.isVisible()) return
    Promise.resolve()
      .then(request)
      .then((sentinel) => {
        if (stopped) {
          sentinel.release().catch(ignore)
          return
        }
        held?.release().catch(ignore)
        held = sentinel
      })
      .catch(ignore)
  }

  acquire()
  const unsubscribe = env.onVisibilityChange(acquire)
  return () => {
    stopped = true
    unsubscribe()
    held?.release().catch(ignore)
    held = null
  }
}

function browserWakeLock(): WakeLockEnv {
  const wakeLock = 'wakeLock' in navigator ? navigator.wakeLock : null
  return {
    request: wakeLock ? () => wakeLock.request('screen') : null,
    isVisible: () => document.visibilityState === 'visible',
    onVisibilityChange(listener) {
      document.addEventListener('visibilitychange', listener)
      return () => document.removeEventListener('visibilitychange', listener)
    },
  }
}

export function useWakeLock(on: boolean) {
  useEffect(() => (on ? keepScreenOn(browserWakeLock()) : undefined), [on])
}
