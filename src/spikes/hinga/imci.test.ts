import { describe, expect, it } from 'vitest'
import { classifyBreathing, fastBreathingCutoff } from './imci'

describe('WHO IMCI 2014 fast-breathing cut-offs', () => {
  it.each([
    [0, 60],
    [1.9, 60],
    [2, 50],
    [11.9, 50],
    [12, 40], // exactly 12 months uses 40
    [24, 40],
    [59.9, 40],
  ])('age %s months: %i/min or more', (age, cutoff) => {
    expect(fastBreathingCutoff(age)).toBe(cutoff)
  })

  it.each([60, 72, -1, Number.NaN, Number.POSITIVE_INFINITY])('age %s months is outside the IMCI range', (age) => {
    expect(fastBreathingCutoff(age)).toBeNull()
  })

  it('classifies a count against the cut-off (at the cut-off is fast)', () => {
    expect(classifyBreathing(40, 12)).toEqual({ kind: 'fast', cutoff: 40 })
    expect(classifyBreathing(39, 12)).toEqual({ kind: 'not-fast', cutoff: 40 })
    expect(classifyBreathing(45, 11.9)).toEqual({ kind: 'not-fast', cutoff: 50 })
    expect(classifyBreathing(50, 6)).toEqual({ kind: 'fast', cutoff: 50 })
    expect(classifyBreathing(59, 1)).toEqual({ kind: 'not-fast', cutoff: 60 })
    expect(classifyBreathing(60, 1)).toEqual({ kind: 'fast', cutoff: 60 })
    expect(classifyBreathing(45, 60)).toEqual({ kind: 'out-of-range' })
  })
})
