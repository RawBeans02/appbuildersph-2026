import { describe, expect, it } from 'vitest'
import {
  COUNT_FIELDS,
  createPayload,
  flattenCounts,
  isEpiWeek,
  isoWeek,
  isoWeeksInYear,
  mapCounts,
  unflattenCounts,
  validatePayload,
  type QrPayloadV1,
} from './schema'
import { SUPPRESSED } from './suppress'
import { SAMPLE_COUNTS, sampleInput } from './testFixtures'

function samplePayload(): QrPayloadV1 {
  return createPayload(sampleInput())
}

// A deep copy as a loose object, to break on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- these tests write invalid shapes on purpose
function loose(payload: QrPayloadV1): Record<string, any> {
  return structuredClone(payload)
}

function problemsOf(value: unknown): string[] {
  const result = validatePayload(value)
  return result.ok ? [] : result.problems
}

describe('createPayload', () => {
  it('suppresses every small count and keeps the rest exact', () => {
    expect(samplePayload()).toEqual({
      version: 1,
      municipality: 'SID',
      barangay: 'SID-MAL',
      epiWeek: '2026-W41',
      seq: 12,
      counts: {
        exposed: { under2m: SUPPRESSED, m2to12: 27, y1to5: 118, y5to17: 642, y18to59: 1484, y60plus: 233 },
        inWatchWindow: 412,
        fastBreathing: { under2m: 0, m2to12: SUPPRESSED, y1to5: 14 },
        urgentReferrals: SUPPRESSED,
        doxyCapsulesOnHand: 1200,
        doxyCapsulesExpiring6w: 300,
        clinicianReviewFlags: 31,
      },
    })
  })

  it('refuses raw counts with extra keys, so nothing else rides along', () => {
    const counts = { ...SAMPLE_COUNTS, names: 'Residente 001' } as unknown as typeof SAMPLE_COUNTS
    expect(() => createPayload(sampleInput({ counts }))).toThrow(/counts: has unknown keys/)
    const exposed = { ...SAMPLE_COUNTS.exposed, purok3: 4 }
    expect(() => createPayload(sampleInput({ counts: { ...SAMPLE_COUNTS, exposed } }))).toThrow(
      /counts\.exposed: has unknown keys/,
    )
  })

  it('refuses raw counts that are not whole numbers from 0 up', () => {
    for (const bad of [-1, 2.5, Number.NaN, '12']) {
      const counts = { ...SAMPLE_COUNTS, urgentReferrals: bad } as unknown as typeof SAMPLE_COUNTS
      expect(() => createPayload(sampleInput({ counts }))).toThrow(/counts\.urgentReferrals/)
    }
  })

  it('refuses a bad code, week or seq', () => {
    expect(() => createPayload(sampleInput({ barangay: 'Maligaya-D' }))).toThrow(/barangay/)
    expect(() => createPayload(sampleInput({ epiWeek: '2026-10-09' }))).toThrow(/epiWeek/)
    expect(() => createPayload(sampleInput({ seq: 0 }))).toThrow(/seq/)
  })
})

describe('validatePayload', () => {
  it('accepts a payload built by createPayload', () => {
    expect(validatePayload(samplePayload())).toEqual({ ok: true, value: samplePayload() })
  })

  it('rejects unknown keys at every level', () => {
    const top = loose(samplePayload())
    top.name = 'Residente 001'
    expect(problemsOf(top)).toEqual(['payload: has unknown keys'])

    const counts = loose(samplePayload())
    counts.counts.household = 'HH-0042'
    expect(problemsOf(counts)).toEqual(['counts: has unknown keys'])

    const band = loose(samplePayload())
    band.counts.exposed.purok = 5
    expect(problemsOf(band)).toEqual(['counts.exposed: has unknown keys'])
  })

  it('rejects missing keys', () => {
    const payload = loose(samplePayload())
    delete payload.epiWeek
    delete payload.counts.fastBreathing.y1to5
    expect(problemsOf(payload)).toEqual([
      'payload: missing epiWeek',
      'epiWeek: must be an ISO week like 2026-W41',
      'counts.fastBreathing: missing y1to5',
    ])
  })

  it('rejects free text in place of a count', () => {
    for (const text of ['twelve', '12', '<5 ', '≥5', 'Residente 001', '']) {
      const payload = loose(samplePayload())
      payload.counts.inWatchWindow = text
      expect(problemsOf(payload)).toEqual([
        'counts.inWatchWindow: must be 0, "<5" or a whole number from 5 to 999999',
      ])
    }
  })

  it('rejects an exact count from 1 to 4 (it must be suppressed)', () => {
    for (const small of [1, 2, 3, 4]) {
      const payload = loose(samplePayload())
      payload.counts.exposed.y60plus = small
      expect(problemsOf(payload)).toHaveLength(1)
    }
  })

  it('rejects free text or another municipality in the codes', () => {
    for (const barangay of ['Maligaya-D', 'SID-Maligaya', 'sid-mal', 'SID-MAL ', 'XYZ-MAL', 'Juan dela Cruz']) {
      expect(problemsOf({ ...samplePayload(), barangay })).toHaveLength(1)
    }
    expect(problemsOf({ ...samplePayload(), municipality: 'San Isidro', barangay: 'SID-MAL' })).toEqual([
      'municipality: must be 3 capital letters or digits',
    ])
  })

  it('rejects dates and impossible weeks', () => {
    for (const epiWeek of ['2026-10-09', '2026-W54', '2025-W53', '2026-W00', '2026-W5', '2026W41', 41, null]) {
      expect(problemsOf({ ...samplePayload(), epiWeek })).toEqual(['epiWeek: must be an ISO week like 2026-W41'])
    }
    expect(problemsOf({ ...samplePayload(), epiWeek: '2026-W53' })).toEqual([])
  })

  it('rejects a bad version or seq', () => {
    expect(problemsOf({ ...samplePayload(), version: 2 })).toEqual(['version: must be 1'])
    for (const seq of [0, -1, 1.5, '12', 1_000_000]) {
      expect(problemsOf({ ...samplePayload(), seq })).toEqual(['seq: must be a whole number from 1 to 999999'])
    }
  })

  it('rejects non-objects and arrays in place of objects', () => {
    expect(problemsOf(null)).toEqual(['payload: not an object'])
    expect(problemsOf([samplePayload()])).toEqual(['payload: not an object'])
    const payload = loose(samplePayload())
    payload.counts.exposed = flattenCounts(samplePayload().counts).slice(0, 6)
    expect(problemsOf(payload)).toEqual(['counts.exposed: not an object'])
  })

  it('never echoes the rejected text in its problems', () => {
    const payload = loose(samplePayload())
    payload['Residente 001'] = 'Purok 3'
    payload.counts.urgentReferrals = 'Juan dela Cruz'
    const problems = problemsOf(payload).join(' ')
    expect(problems).not.toMatch(/Residente|Purok|Juan/)
  })
})

describe('ISO weeks', () => {
  it('names the week of a date on the device calendar', () => {
    expect(isoWeek(new Date(2026, 9, 9))).toBe('2026-W41')
    expect(isoWeek(new Date(2026, 0, 1))).toBe('2026-W01')
    // Monday Dec 29, 2025 is in 2026's first week; Jan 1, 2027 is in 2026-W53.
    expect(isoWeek(new Date(2025, 11, 29))).toBe('2026-W01')
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53')
    expect(isoWeek(new Date(2021, 0, 3))).toBe('2020-W53')
  })

  it('knows which years have 53 weeks', () => {
    expect([2020, 2021, 2025, 2026, 2027].map(isoWeeksInYear)).toEqual([53, 52, 52, 53, 52])
  })

  it('accepts every week isoWeek produces through 2026', () => {
    for (let day = new Date(2026, 0, 1); day.getFullYear() === 2026; day.setDate(day.getDate() + 1)) {
      expect(isEpiWeek(isoWeek(day))).toBe(true)
    }
  })
})

describe('flattenCounts', () => {
  it(`lays the ${COUNT_FIELDS} counts out in a fixed order and back`, () => {
    const flat = flattenCounts(SAMPLE_COUNTS)
    expect(flat).toEqual([3, 27, 118, 642, 1484, 233, 412, 0, 2, 14, 1, 1200, 300, 31])
    expect(flat).toHaveLength(COUNT_FIELDS)
    expect(unflattenCounts(flat)).toEqual(SAMPLE_COUNTS)
    expect(mapCounts(SAMPLE_COUNTS, (n) => n * 2).doxyCapsulesOnHand).toBe(2400)
    expect(() => unflattenCounts(flat.slice(1))).toThrow(RangeError)
  })
})
