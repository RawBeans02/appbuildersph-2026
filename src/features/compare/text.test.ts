import { describe, expect, it } from 'vitest'
import { flaggedAt, lotStatusLine, reasonSentence } from './text'

describe('screen 13 wording', () => {
  it("states each lot's expiry and status", () => {
    expect(lotStatusLine('2026-11', 'expiring')).toBe('EXP Nov 2026 · within 6 weeks')
    expect(lotStatusLine('2027-07', 'ok')).toBe('EXP Jul 2027 · usable')
    expect(lotStatusLine('2026-08', 'expired')).toBe('EXP Aug 2026 · expired: set aside')
  })

  it('ends each rule reason with one period, keeping its words', () => {
    expect(reasonSentence('12 residents are in or near the leptospirosis watch window')).toBe(
      '12 residents are in or near the leptospirosis watch window.',
    )
    expect(reasonSentence('No usable doxycycline capsules on hand.')).toBe('No usable doxycycline capsules on hand.')
  })

  it("shows when a flag was raised on the device's calendar and clock", () => {
    expect(flaggedAt(new Date(2026, 9, 10, 9, 1).toISOString())).toBe('Sat, Oct 10, 9:01 AM')
    // Just after local midnight: the local day, whatever the UTC day is.
    expect(flaggedAt(new Date(2026, 9, 10, 0, 30).toISOString())).toBe('Sat, Oct 10, 12:30 AM')
    expect(flaggedAt(new Date(2026, 9, 9, 23, 45).toISOString())).toBe('Fri, Oct 9, 11:45 PM')
  })
})
