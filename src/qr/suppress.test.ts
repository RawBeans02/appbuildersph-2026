import { describe, expect, it } from 'vitest'
import {
  SUPPRESSED,
  countRange,
  formatCount,
  formatRange,
  isExact,
  isValidCount,
  MAX_COUNT,
  suppress,
  sumCounts,
} from './suppress'

describe('suppress', () => {
  it('keeps 0, suppresses 1 to 4 as "<5", keeps 5 and up exact', () => {
    expect(suppress(0)).toBe(0)
    expect(suppress(1)).toBe(SUPPRESSED)
    expect(suppress(2)).toBe(SUPPRESSED)
    expect(suppress(3)).toBe(SUPPRESSED)
    expect(suppress(4)).toBe(SUPPRESSED)
    expect(suppress(5)).toBe(5)
    expect(suppress(MAX_COUNT)).toBe(MAX_COUNT)
  })

  it('refuses anything that is not a whole number from 0 to MAX_COUNT', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_COUNT + 1]) {
      expect(() => suppress(bad)).toThrow(RangeError)
    }
  })
})

describe('isValidCount', () => {
  it('accepts only what suppression can produce', () => {
    for (const ok of [0, 5, 6, MAX_COUNT, SUPPRESSED]) expect(isValidCount(ok)).toBe(true)
    for (const bad of [1, 2, 3, 4, -5, 5.5, MAX_COUNT + 1, '5', '<4', ' <5', '≥5', null, undefined, [], {}]) {
      expect(isValidCount(bad)).toBe(false)
    }
  })
})

describe('ranges and sums', () => {
  it('reads "<5" as 1 to 4, since 0 is never suppressed', () => {
    expect(countRange(SUPPRESSED)).toEqual({ min: 1, max: 4 })
    expect(countRange(0)).toEqual({ min: 0, max: 0 })
    expect(countRange(12)).toEqual({ min: 12, max: 12 })
  })

  it('sums exact counts exactly', () => {
    const total = sumCounts([12, 0, 5])
    expect(total).toEqual({ min: 17, max: 17 })
    expect(isExact(total)).toBe(true)
    expect(formatRange(total)).toBe('17')
  })

  it('turns a sum that includes "<5" into an honest range', () => {
    const total = sumCounts([12, SUPPRESSED, 0, SUPPRESSED])
    expect(total).toEqual({ min: 14, max: 20 })
    expect(isExact(total)).toBe(false)
    expect(formatRange(total)).toBe('14–20')
  })

  it('sums nothing to 0', () => {
    expect(sumCounts([])).toEqual({ min: 0, max: 0 })
  })

  it('formats one cell as it was sent', () => {
    expect(formatCount(SUPPRESSED)).toBe('<5')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(240)).toBe('240')
  })
})
