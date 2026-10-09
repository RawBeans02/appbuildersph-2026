import { describe, expect, it } from 'vitest'
import type { Exposure, FloodEvent, HingaCheck, StockLot } from '../../data/db/types'
import { summarizeHome, type HomeRecords } from './summary'

const TODAY = '2026-10-10'
const flood = (startedOn: string, endedOn: string | null = null): FloodEvent => ({
  id: `flood-${startedOn}`,
  startedOn,
  endedOn,
  note: '',
  createdAt: '',
  sample: true,
})
const exposure = (residentId: string, exposedOn: string, kinds: Exposure['kinds'] = ['waded']): Exposure => ({
  id: `e-${residentId}-${exposedOn}`,
  floodEventId: 'f',
  residentId,
  exposedOn,
  kinds,
  createdAt: '',
  sample: true,
})
const check = (outcome: HingaCheck['outcome'], checkedAt: string): HingaCheck => ({
  id: `${outcome}-${checkedAt}`,
  residentId: null,
  checkedAt,
  ageMonths: 20,
  breathsPerMinute: outcome === 'refused' ? null : 45,
  outcome,
  refusal: outcome === 'refused' ? 'motion' : null,
  dangerSigns: [],
  sample: true,
})
const doxy = (quantity: number, expiry: string): StockLot => ({
  id: `lot-${expiry}`,
  drug: 'Doxycycline',
  strength: '100 mg',
  lot: 'L',
  expiry,
  quantity,
  unit: 'capsule',
  source: 'manual',
  ocrConfidence: null,
  confirmedAt: '',
  sample: true,
})

const empty: HomeRecords = { floodEvents: [], exposures: [], hingaChecks: [], stockLots: [], flags: [] }

describe('summarizeHome', () => {
  it("adds up the demo phone's day", () => {
    const summary = summarizeHome(
      {
        floodEvents: [flood('2026-10-04'), flood('2026-08-01', '2026-08-03')],
        exposures: [
          exposure('a', '2026-10-04'),
          exposure('b', '2026-10-04', ['waded', 'open-wound']),
          exposure('c', '2026-10-10'),
          exposure('old', '2026-08-01'),
        ],
        hingaChecks: [
          check('fast', '2026-10-08T03:00:00.000Z'),
          check('urgent', '2026-10-09T03:00:00.000Z'),
          check('refused', '2026-10-09T04:00:00.000Z'),
          check('fast', '2026-09-20T03:00:00.000Z'),
        ],
        stockLots: [doxy(10, '2027-07'), doxy(30, '2026-11'), doxy(5, '2026-08')],
        flags: [
          { id: 'f1', kind: 'clinician-review', createdAt: '', reason: '', details: {}, status: 'open', sample: false },
          { id: 'f2', kind: 'clinician-review', createdAt: '', reason: '', details: {}, status: 'resolved', sample: false },
        ],
      },
      TODAY,
      true,
    )
    expect(summary).toEqual({
      flood: { startedOn: '2026-10-04', day: 6, window: 'open' },
      watch: { active: 2, upcoming: 1, higherRisk: 1 },
      hingaThisWeek: { fast: 1, urgent: 1, refused: 1 },
      doxycycline: { onHand: 40, expiringSoon: 30, expired: 5 },
      openFlags: 1,
      modelsPrepared: true,
    })
  })

  it('places today before, inside or after the window counted from the flood start', () => {
    const windowOn = (started: string) => summarizeHome({ ...empty, floodEvents: [flood(started)] }, TODAY, null).flood?.window
    expect(windowOn('2026-10-07')).toBe('before')
    expect(windowOn('2026-10-05')).toBe('open')
    expect(windowOn('2026-09-25')).toBe('open')
    expect(windowOn('2026-09-24')).toBe('over')
  })

  it('is all zeros with no flood on a fresh phone', () => {
    expect(summarizeHome(empty, TODAY, false)).toEqual({
      flood: null,
      watch: { active: 0, upcoming: 0, higherRisk: 0 },
      hingaThisWeek: { fast: 0, urgent: 0, refused: 0 },
      doxycycline: { onHand: 0, expiringSoon: 0, expired: 0 },
      openFlags: 0,
      modelsPrepared: false,
    })
  })
})
