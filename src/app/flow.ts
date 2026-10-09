import { useEffect, useSyncExternalStore } from 'react'

// Whether a screen is inside a flow (Hinga, the stock scan, showing the QR),
// where the bottom nav is hidden. A screen calls useFlowMode(true) while in
// its flow; the layout reads useFlowActive().

let active = 0
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useFlowMode(on: boolean) {
  useEffect(() => {
    if (!on) return
    active += 1
    notify()
    return () => {
      active -= 1
      notify()
    }
  }, [on])
}

export function useFlowActive(): boolean {
  return useSyncExternalStore(subscribe, () => active > 0, () => false)
}
