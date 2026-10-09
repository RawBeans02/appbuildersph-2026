import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, localToday } from './dates'

describe('dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-28', 5)).toBe('2026-11-02')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('counts whole days between dates, signed', () => {
    expect(daysBetween('2026-10-01', '2026-10-16')).toBe(15)
    expect(daysBetween('2026-10-16', '2026-10-01')).toBe(-15)
  })

  it('rejects anything but YYYY-MM-DD', () => {
    expect(() => addDays('10/09/2026', 1)).toThrow(RangeError)
  })

  it('formats the local calendar day', () => {
    expect(localToday(new Date(2026, 9, 9, 23, 59))).toBe('2026-10-09')
  })
})
