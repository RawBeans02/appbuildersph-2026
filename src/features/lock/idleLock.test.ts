import { describe, expect, it } from 'vitest'
import { createIdleLock, IDLE_LOCK_MS } from './idleLock'

function setup() {
  let clock = 0
  let locks = 0
  const timers = new Map<number, { run: () => void; at: number }>()
  let next = 1
  const idle = createIdleLock({
    lockNow: () => (locks += 1),
    now: () => clock,
    setTimer: (run, ms) => {
      timers.set(next, { run, at: clock + ms })
      return next++
    },
    clearTimer: (timer) => timers.delete(timer as number),
  })
  const advance = (ms: number, { timersRun = true } = {}) => {
    clock += ms
    if (!timersRun) return
    for (const [id, timer] of [...timers]) {
      if (timer.at <= clock) {
        timers.delete(id)
        timer.run()
      }
    }
  }
  return { idle, advance, locks: () => locks }
}

describe('idle lock', () => {
  it('locks after 5 minutes in the background, by the timer', () => {
    const { idle, advance, locks } = setup()
    idle.hidden()
    advance(IDLE_LOCK_MS - 1)
    expect(locks()).toBe(0)
    advance(1)
    expect(locks()).toBe(1)
  })

  it('locks on return when the frozen page’s timer never ran', () => {
    const { idle, advance, locks } = setup()
    idle.hidden()
    advance(IDLE_LOCK_MS + 10_000, { timersRun: false })
    idle.shown()
    expect(locks()).toBe(1)
  })

  it('a short trip to another app keeps it open', () => {
    const { idle, advance, locks } = setup()
    idle.hidden()
    advance(60_000)
    idle.shown()
    advance(IDLE_LOCK_MS)
    expect(locks()).toBe(0)
  })
})
