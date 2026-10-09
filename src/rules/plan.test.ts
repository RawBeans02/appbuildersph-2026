import { describe, expect, it } from 'vitest'
import { createPayload, type QrPayloadV1, type RawCounts } from '../qr'
import {
  buildPlan,
  latestPerBarangay,
  planTemplateText,
  priorityScore,
  type MunicipalPlan,
  type PlanResult,
} from './plan'

// Invented counts for the rule tests; codes are the demo places' (src/data/places.ts).
type Raw = {
  urgent?: number
  fast?: [number, number, number]
  watch?: number
  onHand?: number
  expiring?: number
  seq?: number
  week?: string
  municipality?: string
}

function payload(barangay: string, raw: Raw = {}): QrPayloadV1 {
  const counts: RawCounts = {
    exposed: { under2m: 0, m2to12: 0, y1to5: 0, y5to17: 6, y18to59: 12, y60plus: 0 },
    inWatchWindow: raw.watch ?? 0,
    fastBreathing: { under2m: raw.fast?.[0] ?? 0, m2to12: raw.fast?.[1] ?? 0, y1to5: raw.fast?.[2] ?? 0 },
    urgentReferrals: raw.urgent ?? 0,
    doxyCapsulesOnHand: raw.onHand ?? 0,
    doxyCapsulesExpiring6w: raw.expiring ?? 0,
    clinicianReviewFlags: 0,
  }
  const municipality = raw.municipality ?? 'SID'
  return createPayload({
    municipality,
    barangay: barangay.replace(/^SID/, municipality),
    epiWeek: raw.week ?? '2026-W41',
    seq: raw.seq ?? 1,
    counts,
  })
}

function planOf(result: PlanResult): MunicipalPlan {
  if (!result.ok) throw new Error(`expected a plan, got ${result.code}`)
  return result.plan
}

const order = (plan: MunicipalPlan) => plan.priority.map((entry) => entry.name)

describe('doctor-team priority', () => {
  it('scores urgent ×3 + fast breathing ×2 + watch window ×1, and shows why', () => {
    const plan = planOf(
      buildPlan([
        payload('SID-BGS', { urgent: 6, fast: [0, 0, 9], watch: 40 }),
        payload('SID-STN', { urgent: 0, fast: [0, 0, 5], watch: 20 }),
      ]),
    )
    expect(order(plan)).toEqual(['Bagong Silang-D', 'Santo Niño-D'])
    const [first, second] = plan.priority
    expect(first).toMatchObject({ rank: 1, barangay: 'SID-BGS', score: { min: 76, max: 76 }, tiedWith: [] })
    expect(first.components.map((part) => [part.key, part.shown, part.weight, part.points])).toEqual([
      ['urgentReferrals', '6', 3, { min: 18, max: 18 }],
      ['fastBreathing', '9', 2, { min: 18, max: 18 }],
      ['inWatchWindow', '40', 1, { min: 40, max: 40 }],
    ])
    expect(second).toMatchObject({ rank: 2, score: { min: 30, max: 30 } })
  })

  it('treats "<5" as 1 to 4: the score is a range, ranked by its minimum', () => {
    // fast: "<5" + "<5" + 7 = 9–15; urgent "<5" = 1–4.
    const counts = payload('SID-BGS', { urgent: 2, fast: [1, 3, 7], watch: 12 }).counts
    expect(priorityScore(counts)).toEqual({ min: 3 + 18 + 12, max: 12 + 30 + 12 })
    const plan = planOf(buildPlan([payload('SID-BGS', { urgent: 2, fast: [1, 3, 7], watch: 12 })]))
    expect(plan.priority[0].components[1]).toMatchObject({ shown: '9–15', count: { min: 9, max: 15 } })
  })

  it('breaks a tie on the minimum by the higher maximum', () => {
    const plan = planOf(
      buildPlan([
        payload('SID-MAB', { watch: 10 }), // 10–10
        payload('SID-RIV', { urgent: 3, watch: 7 }), // 3–12 + 7 = 10–19
      ]),
    )
    expect(order(plan)).toEqual(['Riverside-D', 'Mabini-D'])
    expect(plan.priority.every((entry) => entry.tiedWith.length === 0)).toBe(true)
  })

  it('lists equal scores alphabetically and says so', () => {
    const plan = planOf(
      buildPlan([payload('SID-STN', { watch: 8 }), payload('SID-BGS', { watch: 8 }), payload('SID-MAB', { watch: 20 })]),
    )
    expect(order(plan)).toEqual(['Mabini-D', 'Bagong Silang-D', 'Santo Niño-D'])
    expect(plan.priority[1].tiedWith).toEqual(['SID-STN'])
    expect(plan.priority[2].tiedWith).toEqual(['SID-BGS'])
    expect(planTemplateText(plan)).toContain('Equal scores are listed alphabetically.')
  })

  it('handles every cell being "<5": equal ranges, alphabetical', () => {
    const allSmall: Raw = { urgent: 1, fast: [2, 3, 4], watch: 2, onHand: 3, expiring: 1 }
    const plan = planOf(
      buildPlan([payload('SID-RIV', allSmall), payload('SID-MAL', allSmall), payload('SID-BGS', allSmall)]),
    )
    expect(order(plan)).toEqual(['Bagong Silang-D', 'Maligaya-D', 'Riverside-D'])
    // urgent 1–4 ×3 + fast 3–12 ×2 + watch 1–4.
    for (const entry of plan.priority) expect(entry.score).toEqual({ min: 3 + 6 + 1, max: 12 + 24 + 4 })
    // Nobody has 5 or more in the watch window, so no target for the expiring stock.
    expect(plan.moves).toEqual([])
    expect(plan.noMoveReason).toBe('no-target')
    expect(plan.totals.inWatchWindow).toEqual({ min: 3, max: 12 })
  })

  it('works for a single barangay', () => {
    const plan = planOf(buildPlan([payload('SID-MAL', { watch: 9, fast: [0, 0, 1], onHand: 40, expiring: 30 })]))
    expect(plan.priority).toHaveLength(1)
    expect(plan.priority[0]).toMatchObject({ rank: 1, name: 'Maligaya-D', score: { min: 11, max: 17 } })
    expect(plan.moves).toEqual([])
    expect(plan.noMoveReason).toBe('single-barangay')
    expect(planTemplateText(plan)).toContain('only one barangay has sent counts')
  })
})

describe('doxycycline moves', () => {
  it('moves expiring capsules from a barangay with few in the watch window to one with many and few capsules', () => {
    const plan = planOf(
      buildPlan([
        payload('SID-RIV', { watch: 0, onHand: 50, expiring: 30 }),
        payload('SID-BGS', { watch: 64, onHand: 10 }),
        payload('SID-STN', { watch: 27, onHand: 60 }),
      ]),
    )
    expect(plan.moves).toEqual([
      {
        from: 'SID-RIV',
        fromName: 'Riverside-D',
        to: 'SID-BGS',
        toName: 'Bagong Silang-D',
        capsulesUpTo: 30,
        why: {
          fromInWatchWindow: 0,
          fromOnHand: 50,
          fromExpiring: 30,
          toInWatchWindow: 64,
          toOnHand: 10,
          toWatchRank: 1,
          toOnHandRank: 1,
        },
      },
    ])
    expect(plan.noMoveReason).toBeNull()
  })

  it('counts "<5" in the watch window as few, and suggests "<5" expiring capsules as sent', () => {
    const plan = planOf(
      buildPlan([payload('SID-RIV', { watch: 3, onHand: 6, expiring: 2 }), payload('SID-BGS', { watch: 12, onHand: 0 })]),
    )
    expect(plan.moves).toHaveLength(1)
    expect(plan.moves[0]).toMatchObject({ from: 'SID-RIV', to: 'SID-BGS', capsulesUpTo: '<5' })
    expect(planTemplateText(plan)).toContain('Riverside-D to Bagong Silang-D: the few (<5) capsules that expire within 6 weeks')
  })

  it('weighs fewest capsules on hand as much as most residents in the window', () => {
    // Watch ranks: MAB 1, STN 2, BGS 3. Fewest-capsule ranks: STN 1, BGS 1, MAB 3.
    // Sums: STN 3, MAB 4, BGS 4. STN goes first.
    const plan = planOf(
      buildPlan([
        payload('SID-RIV', { watch: 0, onHand: 40, expiring: 40 }),
        payload('SID-MAB', { watch: 40, onHand: 500 }),
        payload('SID-STN', { watch: 38, onHand: 0 }),
        payload('SID-BGS', { watch: 10, onHand: 0 }),
      ]),
    )
    expect(plan.moves.map((move) => [move.to, move.why.toWatchRank, move.why.toOnHandRank])).toEqual([['SID-STN', 2, 1]])
  })

  it('gives the largest expiring stock to the first target, the next to the second, never more than expiring', () => {
    const plan = planOf(
      buildPlan([
        payload('SID-RIV', { watch: 0, onHand: 50, expiring: 30 }),
        payload('SID-MAL', { watch: 2, onHand: 12, expiring: 10 }),
        payload('SID-BGS', { watch: 64, onHand: 0 }),
        payload('SID-STN', { watch: 27, onHand: 5 }),
      ]),
    )
    expect(plan.moves.map((move) => [move.from, move.to, move.capsulesUpTo])).toEqual([
      ['SID-RIV', 'SID-BGS', 30],
      ['SID-MAL', 'SID-STN', 10],
    ])
    for (const move of plan.moves) expect(move.capsulesUpTo).toBe(move.why.fromExpiring)
  })

  it('suggests nothing when there is no doxycycline anywhere', () => {
    const plan = planOf(buildPlan([payload('SID-RIV', { watch: 0 }), payload('SID-BGS', { watch: 64 })]))
    expect(plan.moves).toEqual([])
    expect(plan.noMoveReason).toBe('no-doxycycline')
    expect(planTemplateText(plan)).toContain('No stock move suggested: no barangay reported doxycycline on hand.')
  })

  it('suggests nothing when no capsules expire within 6 weeks', () => {
    const plan = planOf(buildPlan([payload('SID-RIV', { onHand: 50 }), payload('SID-BGS', { watch: 64 })]))
    expect(plan.noMoveReason).toBe('none-expiring')
  })

  it('keeps expiring stock where 5 or more residents are in the watch window', () => {
    const plan = planOf(
      buildPlan([payload('SID-MAL', { watch: 9, onHand: 40, expiring: 30 }), payload('SID-BGS', { watch: 64 })]),
    )
    expect(plan.moves).toEqual([])
    expect(plan.noMoveReason).toBe('expiring-where-needed')
  })
})

describe('weeks, seqs and totals', () => {
  it('uses each barangay\'s most recent QR, by week then seq, and marks an older week', () => {
    const payloads = [
      payload('SID-BGS', { week: '2026-W41', seq: 2, watch: 30 }),
      payload('SID-BGS', { week: '2026-W41', seq: 3, watch: 35 }),
      payload('SID-BGS', { week: '2026-W40', seq: 9, watch: 99 }),
      payload('SID-MAB', { week: '2026-W40', seq: 4, watch: 8 }),
    ]
    const { kept, superseded } = latestPerBarangay(payloads)
    expect(kept.map((p) => [p.barangay, p.seq])).toEqual([
      ['SID-BGS', 3],
      ['SID-MAB', 4],
    ])
    expect(superseded.map((p) => p.seq).sort()).toEqual([2, 9])

    const plan = planOf(buildPlan(payloads))
    expect(plan.epiWeek).toBe('2026-W41')
    expect(plan.rows.map((row) => [row.name, row.seq, row.olderWeek])).toEqual([
      ['Bagong Silang-D', 3, false],
      ['Mabini-D', 4, true],
    ])
    expect(plan.superseded).toHaveLength(2)
    expect(plan.totals.inWatchWindow).toEqual({ min: 43, max: 43 })
    expect(planTemplateText(plan)).toContain('Older week: Mabini-D last sent week 2026-W40.')
  })

  it('sums totals as ranges when "<5" cells are in them', () => {
    const plan = planOf(buildPlan([payload('SID-BGS', { watch: 3, urgent: 7 }), payload('SID-STN', { watch: 20, urgent: 1 })]))
    expect(plan.totals.inWatchWindow).toEqual({ min: 21, max: 24 })
    expect(plan.totals.urgentReferrals).toEqual({ min: 8, max: 11 })
  })

  it('refuses an empty list and mixed municipalities', () => {
    expect(buildPlan([])).toMatchObject({ ok: false, code: 'empty' })
    expect(buildPlan([payload('SID-BGS'), payload('SID-MAB', { municipality: 'XYZ' })])).toMatchObject({
      ok: false,
      code: 'mixed-municipalities',
    })
  })

  it('shows codes it has no name for, and marks sample rows', () => {
    const plan = planOf(buildPlan([payload('SID-QQQ', { watch: 5 }), payload('SID-RIV')], { sampleBarangays: new Set(['SID-RIV']) }))
    expect(plan.rows.map((row) => [row.name, row.sample])).toEqual([
      ['Riverside-D', true],
      ['SID-QQQ', false],
    ])
    expect(planTemplateText(plan)).toContain('Riverside-D export 1 (2026-W41, sample data)')
  })
})

describe('template text', () => {
  const plan = planOf(
    buildPlan([
      payload('SID-BGS', { urgent: 5, fast: [1, 3, 7], watch: 64, onHand: 10 }),
      payload('SID-RIV', { watch: 2, fast: [0, 0, 1], onHand: 50, expiring: 30 }),
      payload('SID-MAB', { watch: 11, fast: [0, 0, 5], onHand: 24, seq: 2 }),
    ]),
  )
  const text = planTemplateText(plan, 'San Isidro Demo')

  it('reads as a plan for the officer, in order, with the reasons', () => {
    expect(text).toContain('Draft plan for week 2026-W41, San Isidro Demo (SID)')
    expect(text).toContain('Para sa pagsusuri at pag-apruba ng MHO')
    expect(text).toContain(
      '1. Bagong Silang-D: score 97–109 = 5 urgent danger-sign referrals ×3 (15) + 9–15 fast-breathing referrals (Hinga) ×2 (18–30) + 64 residents in the watch window ×1 (64)',
    )
    expect(text.indexOf('2. Mabini-D')).toBeLessThan(text.indexOf('3. Riverside-D'))
    expect(text).toContain(
      '- Riverside-D to Bagong Silang-D: up to 30 capsules that expire within 6 weeks. Riverside-D has <5 residents in the watch window and 50 capsules on hand; Bagong Silang-D has 64 residents in the watch window and 10 capsules on hand.',
    )
    expect(text).toContain('Batayan (based on): Bagong Silang-D export 1 (2026-W41); Mabini-D export 2 (2026-W41); Riverside-D export 1 (2026-W41).')
  })

  it('uses only numbers from the plan (and the fixed rule constants)', () => {
    const allowed = new Set<string>(['1', '4', '5', '6', '15', '2026', '41'])
    const add = (n: number) => allowed.add(String(n))
    for (const row of plan.rows) add(row.seq)
    for (const entry of plan.priority) {
      add(entry.rank)
      add(entry.score.min)
      add(entry.score.max)
      for (const part of entry.components) {
        add(part.weight)
        for (const n of [part.count.min, part.count.max, part.points.min, part.points.max]) add(n)
      }
    }
    for (const move of plan.moves) {
      for (const value of [move.capsulesUpTo, ...Object.values(move.why)]) if (typeof value === 'number') add(value)
    }
    const numbers = text.match(/\d+/g) ?? []
    expect(numbers.length).toBeGreaterThan(10)
    expect(numbers.filter((n) => !allowed.has(n))).toEqual([])
  })

  it('never diagnoses or doses', () => {
    expect(text).not.toMatch(/\bmg\b|per (person|resident)|take \d|diagnos(is|ed) (of|with)/i)
    expect(text).toContain('This plan does not diagnose anyone and sets no dose')
  })
})
