import { describe, expect, it } from 'vitest'
import { NOW } from './test/fixtures.js'
import { acceptedWeeks, manilaWeek, weekAccepted } from './weeks.js'

describe('the accepted report weeks (Philippine calendar)', () => {
  it('reads the week by the date in Manila, not UTC', () => {
    // Sunday 23:59 in Manila is still week 41; a minute later it's Monday, week 42.
    expect(manilaWeek(new Date('2026-10-11T15:59:00Z'))).toBe('2026-W41')
    expect(manilaWeek(new Date('2026-10-11T16:00:00Z'))).toBe('2026-W42')
    // New Year's Day 2027 in Manila belongs to 2026's week 53 (2026 starts on a Thursday).
    expect(manilaWeek(new Date('2026-12-31T16:00:00Z'))).toBe('2026-W53')
    expect(manilaWeek(new Date('2027-01-03T16:00:00Z'))).toBe('2027-W01')
  })

  it('runs from 8 weeks back to this week, or next week once it is 2 days away', () => {
    // NOW is Saturday Oct 10, 09:00 in Manila: Monday is 2 days away.
    expect(acceptedWeeks(NOW)).toEqual({ earliest: '2026-W33', latest: '2026-W42' })
    // On Wednesday (Oct 7) next week is 5 days away: only this week.
    expect(acceptedWeeks(new Date('2026-10-07T01:00:00Z'))).toEqual({ earliest: '2026-W33', latest: '2026-W41' })
    const window = acceptedWeeks(NOW)
    expect(['2026-W33', '2026-W41', '2026-W42'].map((week) => weekAccepted(week, window))).toEqual([true, true, true])
    expect(['2026-W32', '2026-W43', '2099-W01', '2025-W41'].map((week) => weekAccepted(week, window))).toEqual([false, false, false, false])
  })

  it('crosses a year the same way', () => {
    const window = acceptedWeeks(new Date('2027-01-02T01:00:00Z'))
    expect(window).toEqual({ earliest: '2026-W45', latest: '2027-W01' })
    expect(weekAccepted('2026-W53', window)).toBe(true)
    expect(weekAccepted('2027-W02', window)).toBe(false)
  })
})
