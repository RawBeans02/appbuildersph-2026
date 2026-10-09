import { describe, expect, it } from 'vitest'
import { clockTime, dayRange, formatFreeSpace, formatMB, monthDay, monthYear, weekdayMonthDay, weekdayMonthDayPlain } from './format'

describe('format', () => {
  it('writes days the way the copy deck does', () => {
    expect(monthDay('2026-10-15')).toBe('Oct 15')
    expect(weekdayMonthDay('2026-10-04')).toBe('Sun, Oct 4')
    expect(weekdayMonthDayPlain('2026-10-10')).toBe('Sat Oct 10')
    expect(dayRange('2026-10-09', '2026-10-19')).toBe('Oct 9 to 19')
    expect(dayRange('2026-10-30', '2026-11-09')).toBe('Oct 30 to Nov 9')
    expect(monthYear('2026-11')).toBe('Nov 2026')
  })

  it('writes sizes and times', () => {
    expect(formatMB(55_100_000)).toBe('55.1 MB')
    expect(formatFreeSpace(2_100_000_000)).toBe('2.1 GB')
    expect(formatFreeSpace(21_400_000)).toBe('21.4 MB')
    expect(clockTime(new Date(2026, 9, 10, 8, 31))).toBe('8:31 AM')
    expect(clockTime(new Date(2026, 9, 10, 12, 5))).toBe('12:05 PM')
    expect(clockTime(new Date(2026, 9, 10, 0, 7))).toBe('12:07 AM')
  })
})
