import { describe, expect, it } from 'vitest'
import { ageInMonths } from '../features/send/counts'
import { ageBandLabel, completedMonths, DANGER_SIGNS, fastBreathingCutoff, hingaOutcome } from './imci'

describe('WHO IMCI 2014 fast-breathing cut-offs', () => {
  it.each([
    [0, 60],
    [1, 60],
    [1.9, 60],
    [2, 50],
    [11, 50],
    [11.9, 50],
    [12, 40], // exactly 12 months uses 40
    [24, 40],
    [59, 40],
  ])('age %s months: %i/min or more', (age, cutoff) => {
    expect(fastBreathingCutoff(age)).toBe(cutoff)
  })

  it.each([60, 72, -1, Number.NaN, Number.POSITIVE_INFINITY])('age %s months is outside the IMCI range', (age) => {
    expect(fastBreathingCutoff(age)).toBeNull()
    expect(ageBandLabel(age)).toBeNull()
  })

  it('names the age bands', () => {
    expect([0, 2, 12].map(ageBandLabel)).toEqual(['under 2 months', '2 to 12 months', '12 months to 5 years'])
  })
})

describe('age in whole months', () => {
  it('counts completed months only', () => {
    expect(completedMonths('2025-10-09', '2026-10-09')).toBe(12)
    expect(completedMonths('2025-10-10', '2026-10-09')).toBe(11)
    expect(completedMonths('2026-08-31', '2026-10-09')).toBe(1)
    expect(completedMonths('2026-10-01', '2026-10-09')).toBe(0)
  })

  it('agrees with the age the QR counts use', () => {
    for (const birth of ['2021-11-30', '2024-02-29', '2025-10-09', '2026-01-15', '2026-09-10']) {
      for (const day of ['2026-10-09', '2026-10-10', '2027-03-01']) {
        expect(completedMonths(birth, day)).toBe(ageInMonths(birth, day))
      }
    }
  })
})

describe('check outcome', () => {
  it('is fast at or above the cut-off and not fast below it', () => {
    expect(hingaOutcome({ breathsPerMinute: 40, ageMonths: 12, dangerSigns: [] })).toBe('fast')
    expect(hingaOutcome({ breathsPerMinute: 39, ageMonths: 12, dangerSigns: [] })).toBe('not-fast')
    expect(hingaOutcome({ breathsPerMinute: 45, ageMonths: 11, dangerSigns: [] })).toBe('not-fast')
    expect(hingaOutcome({ breathsPerMinute: 60, ageMonths: 1, dangerSigns: [] })).toBe('fast')
  })

  it('lists the four IMCI 2014 general danger signs, plus chest indrawing and stridor as severe signs', () => {
    expect(DANGER_SIGNS.filter((sign) => sign.kind === 'general').map((sign) => sign.id)).toEqual([
      'unable-to-drink',
      'vomits-everything',
      'convulsions',
      'lethargic',
    ])
    expect(DANGER_SIGNS.filter((sign) => sign.kind === 'severe').map((sign) => sign.id)).toEqual(['chest-indrawing', 'stridor'])
  })

  it('makes "vomits everything" alone urgent, even with a normal rate', () => {
    expect(hingaOutcome({ breathsPerMinute: 30, ageMonths: 24, dangerSigns: ['vomits-everything'] })).toBe('urgent')
  })

  it('refers urgently on chest indrawing alone (more cautious than IMCI 2014, by design)', () => {
    expect(hingaOutcome({ breathsPerMinute: 30, ageMonths: 24, dangerSigns: ['chest-indrawing'] })).toBe('urgent')
  })

  it('any danger sign makes it urgent, with or without a count', () => {
    expect(hingaOutcome({ breathsPerMinute: 30, ageMonths: 24, dangerSigns: ['stridor'] })).toBe('urgent')
    expect(hingaOutcome({ breathsPerMinute: null, ageMonths: 24, dangerSigns: ['convulsions'] })).toBe('urgent')
  })

  it('is refused when the camera could not count and there is no danger sign', () => {
    expect(hingaOutcome({ breathsPerMinute: null, ageMonths: 24, dangerSigns: [] })).toBe('refused')
  })

  it('has no outcome outside the IMCI age range', () => {
    expect(hingaOutcome({ breathsPerMinute: 45, ageMonths: 60, dangerSigns: [] })).toBeNull()
  })
})
