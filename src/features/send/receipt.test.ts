import { describe, expect, it } from 'vitest'
import { createPayload, type RawCounts } from '../../qr'
import { exportReceipt } from './receipt'

const RAW: RawCounts = {
  exposed: { under2m: 0, m2to12: 0, y1to5: 0, y5to17: 3, y18to59: 6, y60plus: 1 },
  inWatchWindow: 9,
  fastBreathing: { under2m: 0, m2to12: 0, y1to5: 2 },
  urgentReferrals: 0,
  doxyCapsulesOnHand: 40,
  doxyCapsulesExpiring6w: 30,
  clinicianReviewFlags: 1,
}

describe('exportReceipt', () => {
  it('reads the count cells, the text length, the export number and the key from the export', () => {
    const payload = createPayload({ municipality: 'SID', barangay: 'SID-MAL', epiWeek: '2026-W41', seq: 3, counts: RAW })
    const text = 'AGP1.abc.def'
    expect(exportReceipt({ payload, text, fingerprint: '3109-7D1D-0CAB-216B' })).toEqual({
      counts: 14,
      bytes: text.length,
      seq: 3,
      fingerprint: '3109-7D1D-0CAB-216B',
    })
  })

  it('measures the text it is given, not a fixed size', () => {
    const payload = createPayload({ municipality: 'SID', barangay: 'SID-MAL', epiWeek: '2026-W41', seq: 1, counts: RAW })
    expect(exportReceipt({ payload, text: 'x'.repeat(282), fingerprint: 'F' }).bytes).toBe(282)
  })
})
