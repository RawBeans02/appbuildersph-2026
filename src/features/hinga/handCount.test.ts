import { describe, expect, it } from 'vitest'
import { clockText, HAND_COUNT_MS, handRate, isDone, msLeft, NOT_STARTED, tap, type HandCount } from './handCount'

// A tap on every breath at `perMin` breaths a minute, from `startMs`, as long
// as they fall before `untilMs`.
function tapAt(perMin: number, startMs: number, untilMs: number): HandCount {
  let count = NOT_STARTED
  for (let k = 0; startMs + (k * 60_000) / perMin < untilMs; k++) count = tap(count, startMs + (k * 60_000) / perMin)
  return count
}

describe('Hinga count by hand', () => {
  it('waits for the first tap to start the clock', () => {
    expect(msLeft(NOT_STARTED, 123_456)).toBe(HAND_COUNT_MS)
    expect(isDone(NOT_STARTED, 999_999)).toBe(false)
    expect(handRate(NOT_STARTED, 999_999)).toBeNull()

    const first = tap(NOT_STARTED, 5_000)
    expect(first).toEqual({ startedAt: 5_000, taps: 1 })
    expect(msLeft(first, 5_000)).toBe(60_000)
    expect(msLeft(first, 35_500)).toBe(29_500)
  })

  it('gives the taps in the full minute as breaths a minute', () => {
    // 40 a minute, tapped from the first breath.
    const forty = tapAt(40, 1_000, 1_000 + HAND_COUNT_MS)
    expect(handRate(forty, 1_000 + HAND_COUNT_MS)).toBe(40)
    // 52 a minute (the design's example).
    const fiftyTwo = tapAt(52, 0, HAND_COUNT_MS)
    expect(handRate(fiftyTwo, HAND_COUNT_MS)).toBe(52)
  })

  it('has no rate before the minute is up', () => {
    const half = tapAt(60, 0, 30_000)
    expect(half.taps).toBe(30)
    expect(handRate(half, 59_999)).toBeNull()
    expect(handRate(half, 60_000)).toBe(30)
  })

  it('ignores taps after the minute', () => {
    const done = tapAt(40, 0, HAND_COUNT_MS)
    expect(done.taps).toBe(40)
    // A tap exactly at 60 s, or later, is past the minute.
    expect(tap(done, 60_000)).toBe(done)
    expect(tap(done, 75_000)).toBe(done)
    expect(handRate(tap(done, 61_000), 61_000)).toBe(40)
    expect(msLeft(done, 90_000)).toBe(0)
  })

  it('rounds a rate between whole numbers up, never down', () => {
    // 40.5 a minute, counted from a breath: 41 taps fall inside the minute.
    const count = tapAt(40.5, 0, HAND_COUNT_MS)
    expect(handRate(count, HAND_COUNT_MS)).toBe(41)
  })

  it('shows the countdown as m:ss, reaching 0:00 only at the end', () => {
    expect(clockText(60_000)).toBe('1:00')
    expect(clockText(59_001)).toBe('1:00')
    expect(clockText(41_200)).toBe('0:42')
    expect(clockText(29_000)).toBe('0:29')
    expect(clockText(1)).toBe('0:01')
    expect(clockText(0)).toBe('0:00')
    expect(clockText(-5)).toBe('0:00')
  })
})
