import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openAgapayDb } from '../../data/db/db'
import type { ExposureStockReview } from '../../rules/stock'
import { flagForClinician, openFlags, resolveFlag } from './flags'

const review: ExposureStockReview = {
  exposed: 12,
  higherRisk: 2,
  needsReview: true,
  reasons: ['12 residents are in or near the leptospirosis watch window', '30 doxycycline capsules expire within 6 weeks'],
  stock: { capsulesOnHand: 40, capsulesExpiringSoon: 30, capsulesExpired: 0, lots: [] },
}

describe('clinician review flags', () => {
  it('records the facts as an open flag, and resolves it', async () => {
    const db = await openAgapayDb('flags-test-1')
    const flag = await flagForClinician(db, review, new Date('2026-10-10T09:00:00Z'))
    expect(flag).toMatchObject({
      kind: 'clinician-review',
      status: 'open',
      reason: '12 residents are in or near the leptospirosis watch window. 30 doxycycline capsules expire within 6 weeks',
      details: { exposed: 12, higherRisk: 2, capsulesOnHand: 40, capsulesExpiringSoon: 30, capsulesExpired: 0 },
    })
    expect(openFlags(await db.flags.list())).toHaveLength(1)
    await resolveFlag(db, flag)
    expect(openFlags(await db.flags.list())).toHaveLength(0)
    db.close()
  })

  it('refuses a flag when no one is being watched', async () => {
    const db = await openAgapayDb('flags-test-2')
    await expect(flagForClinician(db, { ...review, exposed: 0, needsReview: false })).rejects.toThrow('Nothing to review')
    db.close()
  })
})
