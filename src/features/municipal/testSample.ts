import 'fake-indexeddb/auto'
import { openAgapayDb } from '../../data/db/db'
import { createPayload, type QrPayloadV1, type RawCounts } from '../../qr'
import { buildPlan, type MunicipalPlan } from '../../rules/plan'
import { loadMunicipalSample, readHandoff, readPlanInputs, type Handoff } from './municipal'

// Test helpers: the four pre-made sample barangays as the laptop holds them
// on first run, and plain payloads for made-up cases.

export const SAMPLE_NOW = new Date('2026-10-09T08:30:00.000Z')

let count = 0

export async function sampleState(): Promise<{ handoff: Handoff; plan: MunicipalPlan }> {
  const db = await openAgapayDb(`municipal-sample-${++count}`)
  await loadMunicipalSample(db, SAMPLE_NOW)
  const handoff = await readHandoff(db)
  const inputs = await readPlanInputs(db)
  db.close()
  const result = buildPlan(inputs.payloads, { sampleBarangays: inputs.sampleBarangays })
  if (!result.ok) throw new Error(result.code)
  return { handoff, plan: result.plan }
}

export const NO_COUNTS: RawCounts = {
  exposed: { under2m: 0, m2to12: 0, y1to5: 0, y5to17: 0, y18to59: 0, y60plus: 0 },
  inWatchWindow: 0,
  fastBreathing: { under2m: 0, m2to12: 0, y1to5: 0 },
  urgentReferrals: 0,
  doxyCapsulesOnHand: 0,
  doxyCapsulesExpiring6w: 0,
  clinicianReviewFlags: 0,
}

export function payload(barangay: string, counts: Partial<RawCounts>, seq = 1, epiWeek = '2026-W41'): QrPayloadV1 {
  return createPayload({ municipality: 'SID', barangay, epiWeek, seq, counts: { ...NO_COUNTS, ...counts } })
}

export function planOf(payloads: QrPayloadV1[]): MunicipalPlan {
  const result = buildPlan(payloads)
  if (!result.ok) throw new Error(result.code)
  return result.plan
}
