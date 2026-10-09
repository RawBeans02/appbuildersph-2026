import type { AgapayDb } from '../../data/db/db'
import type { Flag } from '../../data/db/types'
import type { ExposureStockReview } from '../../rules/stock'

// A flag asks a clinician to review exposure against stock. It records the
// facts at the time; it never carries a dose. Open flags are counted in the
// de-identified export.

export function openFlags(flags: Flag[]): Flag[] {
  return flags.filter((flag) => flag.status === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function flagForClinician(db: AgapayDb, review: ExposureStockReview, now = new Date()): Promise<Flag> {
  if (!review.needsReview) throw new Error('Nothing to review: no one is being watched.')
  const flag: Flag = {
    id: crypto.randomUUID(),
    kind: 'clinician-review',
    createdAt: now.toISOString(),
    reason: review.reasons.join('. '),
    details: {
      exposed: review.exposed,
      higherRisk: review.higherRisk,
      capsulesOnHand: review.stock.capsulesOnHand,
      capsulesExpiringSoon: review.stock.capsulesExpiringSoon,
      capsulesExpired: review.stock.capsulesExpired,
    },
    status: 'open',
    sample: false,
  }
  await db.flags.put(flag)
  return flag
}

export async function resolveFlag(db: AgapayDb, flag: Flag): Promise<void> {
  await db.flags.put({ ...flag, status: 'resolved' })
}
