import { describe, expect, it } from 'vitest'
import { decodeQr, encodeQr } from './codec'
import { mergePayloads, type MergeResult } from './merge'
import { createPayload, type RawCounts } from './schema'
import { generateDeviceKeyPair, type KeyRegistry } from './sign'
import { formatRange, SUPPRESSED } from './suppress'
import { SAMPLE_COUNTS, sampleInput } from './testFixtures'

// Invented counts: every field 0 except the ones given.
function counts(overrides: Partial<Omit<RawCounts, 'exposed' | 'fastBreathing'>> & {
  exposed?: Partial<RawCounts['exposed']>
  fastBreathing?: Partial<RawCounts['fastBreathing']>
} = {}): RawCounts {
  return {
    inWatchWindow: 0,
    urgentReferrals: 0,
    doxyCapsulesOnHand: 0,
    doxyCapsulesExpiring6w: 0,
    clinicianReviewFlags: 0,
    ...overrides,
    exposed: { under2m: 0, m2to12: 0, y1to5: 0, y5to17: 0, y18to59: 0, y60plus: 0, ...overrides.exposed },
    fastBreathing: { under2m: 0, m2to12: 0, y1to5: 0, ...overrides.fastBreathing },
  }
}

function payload(barangay: string, seq: number, raw: RawCounts) {
  return createPayload(sampleInput({ barangay, seq, counts: raw }))
}

function merged(result: MergeResult) {
  if (!result.ok) throw new Error(`merge failed: ${result.code}`)
  return result
}

describe('mergePayloads', () => {
  it('adds exact counts exactly and turns "<5" into ranges', () => {
    const result = merged(
      mergePayloads([
        payload('SID-RIV', 2, counts({ exposed: { y18to59: 40 }, inWatchWindow: 12, doxyCapsulesOnHand: 100 })),
        payload('SID-MAL', 7, counts({ exposed: { y18to59: 3, y60plus: 6 }, inWatchWindow: 2, doxyCapsulesOnHand: 3 })),
        payload('SID-BAG', 1, counts({ exposed: { y18to59: 1 }, inWatchWindow: 0, doxyCapsulesOnHand: 60 })),
      ]),
    )
    expect(result.municipality).toBe('SID')
    expect(result.epiWeek).toBe('2026-W41')
    expect(result.rows.map((row) => row.barangay)).toEqual(['SID-BAG', 'SID-MAL', 'SID-RIV'])
    expect(result.rows[1].counts.exposed.y18to59).toBe(SUPPRESSED)
    expect(result.duplicates).toEqual([])

    const { totals } = result
    // 40 + "<5" + "<5": 42 to 48.
    expect(totals.exposed.y18to59).toEqual({ min: 42, max: 48 })
    expect(formatRange(totals.exposed.y18to59)).toBe('42–48')
    // Exact: 6 + 0 + 0.
    expect(formatRange(totals.exposed.y60plus)).toBe('6')
    expect(totals.exposed.under2m).toEqual({ min: 0, max: 0 })
    // 12 + "<5" + 0: 13 to 16.
    expect(formatRange(totals.inWatchWindow)).toBe('13–16')
    // 100 + "<5" + 60.
    expect(totals.doxyCapsulesOnHand).toEqual({ min: 161, max: 164 })
  })

  it('keeps the newest of a duplicate barangay, in any scan order, and reports it', () => {
    const older = payload('SID-MAL', 3, counts({ inWatchWindow: 20 }))
    const newer = payload('SID-MAL', 5, counts({ inWatchWindow: 30 }))
    const other = payload('SID-BAG', 1, counts({ inWatchWindow: 10 }))
    for (const order of [
      [older, other, newer],
      [newer, other, older],
    ]) {
      const result = merged(mergePayloads(order))
      expect(result.rows.map((row) => [row.barangay, row.seq])).toEqual([
        ['SID-BAG', 1],
        ['SID-MAL', 5],
      ])
      expect(result.totals.inWatchWindow).toEqual({ min: 40, max: 40 })
      expect(result.duplicates).toEqual([{ barangay: 'SID-MAL', keptSeq: 5, droppedSeqs: [3] }])
    }
  })

  it('counts the same QR scanned twice once', () => {
    const once = payload('SID-MAL', 4, counts({ inWatchWindow: 20 }))
    const result = merged(mergePayloads([once, once]))
    expect(result.rows).toHaveLength(1)
    expect(result.totals.inWatchWindow).toEqual({ min: 20, max: 20 })
    expect(result.duplicates).toEqual([{ barangay: 'SID-MAL', keptSeq: 4, droppedSeqs: [4] }])
  })

  it('refuses QR codes from different weeks or municipalities, or none', () => {
    const thisWeek = payload('SID-MAL', 1, counts())
    const lastWeek = createPayload(sampleInput({ barangay: 'SID-BAG', epiWeek: '2026-W40', counts: counts() }))
    const elsewhere = createPayload(sampleInput({ municipality: 'STR', barangay: 'STR-MAL', counts: counts() }))
    expect(mergePayloads([thisWeek, lastWeek])).toMatchObject({ ok: false, code: 'mixed-epi-weeks' })
    expect(mergePayloads([thisWeek, elsewhere])).toMatchObject({ ok: false, code: 'mixed-municipalities' })
    expect(mergePayloads([])).toMatchObject({ ok: false, code: 'empty' })
  })

  it('merges five barangays end to end: create, sign, scan text, verify, merge', async () => {
    const codes = ['SID-MAL', 'SID-BAG', 'SID-STN', 'SID-MAB', 'SID-RIV']
    const devices = await Promise.all(codes.map(() => generateDeviceKeyPair()))
    const registry: KeyRegistry = Object.fromEntries(codes.map((code, i) => [code, devices[i].publicJwk]))
    const texts = await Promise.all(
      codes.map((code, i) => encodeQr(createPayload(sampleInput({ barangay: code, seq: 1 })), devices[i].privateKey)),
    )
    const decoded = await Promise.all(texts.map((text) => decodeQr(text, registry)))
    const payloads = decoded.map((result) => {
      if (!result.ok) throw new Error(result.code)
      return result.payload
    })
    const result = merged(mergePayloads(payloads))
    expect(result.rows).toHaveLength(5)
    // Five copies of SAMPLE_COUNTS: 1484 adults each, exact; 3 infants each, sent as "<5".
    expect(SAMPLE_COUNTS.exposed.y18to59).toBe(1484)
    expect(result.totals.exposed.y18to59).toEqual({ min: 5 * 1484, max: 5 * 1484 })
    expect(formatRange(result.totals.exposed.under2m)).toBe('5–20')
  })
})
