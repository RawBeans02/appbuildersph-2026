import { describe, expect, it } from 'vitest'
import type { Exposure, StockLot } from '../data/db/types'
import { lastDayOfMonth, lotStatus, reviewExposureStock, summarizeDoxycycline } from './stock'
import { watchList } from './watch'

let n = 0
const lot = (expiry: string, quantity: number, drug = 'Doxycycline', unit = 'capsule'): StockLot => ({
  id: `lot-${n++}`,
  drug,
  strength: '100 mg',
  lot: `DEMO-LOT-${n}`,
  expiry,
  quantity,
  unit,
  source: 'ocr',
  ocrConfidence: null,
  confirmedAt: '2026-10-09T10:00:00.000Z',
  sample: false,
})

const exposure = (residentId: string, exposedOn: string, kinds: Exposure['kinds'] = ['waded']): Exposure => ({
  id: `e-${n++}`,
  floodEventId: 'flood-1',
  residentId,
  exposedOn,
  kinds,
  createdAt: '',
  sample: false,
})

const TODAY = '2026-10-10'

describe('expiry months', () => {
  it('ends on the last day of the month, leap years included', () => {
    expect(lastDayOfMonth('2026-11')).toBe('2026-11-30')
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29')
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31')
  })

  it('is expiring once the expiry month starts within 6 weeks, expired once it has ended', () => {
    expect(lotStatus('2026-09', TODAY)).toBe('expired')
    expect(lotStatus('2026-10', TODAY)).toBe('expiring')
    expect(lotStatus('2026-11', TODAY)).toBe('expiring')
    expect(lotStatus('2026-12', TODAY)).toBe('ok')
  })
})

describe('summarizeDoxycycline', () => {
  it('counts usable, soon-expiring and expired doxycycline capsules only', () => {
    const summary = summarizeDoxycycline(
      [
        lot('2027-06', 10),
        lot('2026-11', 30),
        lot('2026-08', 5),
        lot('2027-06', 100, 'Paracetamol'),
        lot('2027-06', 20, 'Doxycycline', 'tablet'),
      ],
      TODAY,
    )
    expect(summary).toMatchObject({ capsulesOnHand: 40, capsulesExpiringSoon: 30, capsulesExpired: 5 })
    expect(summary.lots.map((l) => l.status)).toEqual(['expired', 'expiring', 'ok'])
  })
})

describe('reviewExposureStock', () => {
  it("states the demo's facts and flags for clinician review", () => {
    const exposures = Array.from({ length: 12 }, (_, i) => exposure(`r${i}`, '2026-10-03', i < 2 ? ['waded', 'open-wound'] : ['waded']))
    const review = reviewExposureStock(watchList(exposures, TODAY), [lot('2027-06', 10), lot('2026-11', 30)], TODAY)
    expect(review).toMatchObject({ exposed: 12, higherRisk: 2, needsReview: true })
    expect(review.stock).toMatchObject({ capsulesOnHand: 40, capsulesExpiringSoon: 30 })
    expect(review.reasons).toEqual([
      '12 residents are in or near the leptospirosis watch window',
      '30 doxycycline capsules expire within 6 weeks',
    ])
  })

  it('says when no usable capsules are on hand, and needs no review without exposures', () => {
    const exposed = reviewExposureStock(watchList([exposure('r1', '2026-10-03')], TODAY), [lot('2026-08', 5)], TODAY)
    expect(exposed.reasons).toEqual([
      '1 resident is in or near the leptospirosis watch window',
      'No usable doxycycline capsules on hand',
      '5 capsules are past expiry: set aside',
    ])
    const none = reviewExposureStock([], [lot('2027-06', 10)], TODAY)
    expect(none).toMatchObject({ exposed: 0, needsReview: false, reasons: [] })
  })

  it('never suggests or computes a dose', () => {
    const exposures = Array.from({ length: 5 }, (_, i) => exposure(`r${i}`, '2026-10-03'))
    const review = reviewExposureStock(watchList(exposures, TODAY), [lot('2026-11', 30), lot('2026-08', 3)], TODAY)
    for (const reason of review.reasons) {
      expect(reason).not.toMatch(/dose|dosage|take|per (person|resident)|each|daily|twice|mg/i)
    }
    expect(Object.keys(review)).not.toContain('perPerson')
  })
})
