import { createPayload, type QrPayloadV1, type RawCounts } from '../../src/qr/index.js'

// A synthetic week for the alerts tests: three demo barangays, invented counts.
// Maligaya-D has the most people in the watch window and referrals; Bagong
// Silang-D has expiring doxycycline and no one in the window; Riverside-D has
// 7 in the window and no stock. The rules then give: doctor team to Maligaya-D,
// move Bagong Silang-D's 30 expiring capsules to Maligaya-D, and watch alerts
// for Maligaya-D and Riverside-D.

const ZERO: RawCounts = {
  exposed: { under2m: 0, m2to12: 0, y1to5: 0, y5to17: 0, y18to59: 0, y60plus: 0 },
  inWatchWindow: 0,
  fastBreathing: { under2m: 0, m2to12: 0, y1to5: 0 },
  urgentReferrals: 0,
  doxyCapsulesOnHand: 0,
  doxyCapsulesExpiring6w: 0,
  clinicianReviewFlags: 0,
}

export const SCENARIO_COUNTS: Record<string, RawCounts> = {
  'SID-MAL': {
    ...ZERO,
    exposed: { ...ZERO.exposed, y18to59: 9 },
    inWatchWindow: 12,
    fastBreathing: { under2m: 0, m2to12: 0, y1to5: 6 },
    urgentReferrals: 2,
    doxyCapsulesOnHand: 10,
    clinicianReviewFlags: 3,
  },
  'SID-BGS': { ...ZERO, doxyCapsulesOnHand: 80, doxyCapsulesExpiring6w: 30 },
  'SID-RIV': { ...ZERO, inWatchWindow: 7, fastBreathing: { under2m: 0, m2to12: 1, y1to5: 0 } },
}

export function scenarioPayloads(epiWeek = '2026-W41'): QrPayloadV1[] {
  return Object.entries(SCENARIO_COUNTS).map(([barangay, counts], i) =>
    createPayload({ municipality: 'SID', barangay, epiWeek, seq: i + 1, counts }),
  )
}
