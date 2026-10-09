import { describe, expect, it } from 'vitest'
import type { CountRange } from '../../qr'
import { PRIORITY_WEIGHTS, type PriorityEntry, type ScoreComponentKey } from '../../rules/plan'
import { BAR_MAX_PX, doctorOrder } from './doctorOrder'

const exact = (n: number): CountRange => ({ min: n, max: n })
const SMALL: CountRange = { min: 1, max: 4 } // a "<5" cell

const shown = (count: CountRange) => (count.min === count.max ? String(count.min) : '<5')

function entry(name: string, counts: Record<ScoreComponentKey, CountRange>): PriorityEntry {
  const keys: ScoreComponentKey[] = ['urgentReferrals', 'fastBreathing', 'inWatchWindow']
  const components = keys.map((key) => {
    const weight = PRIORITY_WEIGHTS[key]
    const count = counts[key]
    return { key, label: key, shown: shown(count), count, weight, points: { min: count.min * weight, max: count.max * weight } }
  })
  const score = components.reduce((sum, part) => ({ min: sum.min + part.points.min, max: sum.max + part.points.max }), { min: 0, max: 0 })
  return { rank: 0, barangay: name, name, score, components, tiedWith: [] }
}

describe('18d doctor-team order bars', () => {
  it('scales the largest score to 360 px and stacks the parts in the brief order', () => {
    const rows = doctorOrder([
      entry('A-D', { urgentReferrals: exact(1), fastBreathing: exact(2), inWatchWindow: exact(10) }), // 3 + 4 + 10 = 17
      entry('B-D', { urgentReferrals: exact(0), fastBreathing: exact(0), inWatchWindow: exact(6) }),
    ])
    expect(rows.map((row) => row.score)).toEqual(['17', '6'])
    const [a, b] = rows
    expect(a.segments.map((segment) => segment.key)).toEqual(['urgentReferrals', 'fastBreathing', 'inWatchWindow'])
    expect(a.segments.map((segment) => segment.solid)).toEqual([(3 / 17) * 360, (4 / 17) * 360, (10 / 17) * 360])
    expect(a.segments.reduce((sum, segment) => sum + segment.solid + segment.dashed, 0)).toBeCloseTo(BAR_MAX_PX)
    expect(a.segments.every((segment) => segment.dashed === 0)).toBe(true)
    expect(b.segments.map((segment) => segment.solid)).toEqual([0, 0, (6 / 17) * 360])
  })

  it('draws a "<5" range solid to its minimum, then dashed to its maximum, scaled by the largest maximum', () => {
    const [row] = doctorOrder([entry('C-D', { urgentReferrals: SMALL, fastBreathing: exact(0), inWatchWindow: exact(5) })])
    // URGENT <5 → 3–12 points; score 8–17.
    expect(row.score).toBe('8–17')
    const urgent = row.segments[0]
    expect(urgent.solid).toBeCloseTo((3 / 17) * 360)
    expect(urgent.dashed).toBeCloseTo((9 / 17) * 360)
    expect(row.segments.reduce((sum, segment) => sum + segment.solid + segment.dashed, 0)).toBeCloseTo(360)
    expect(row.label).toBe('score 8–17 = URGENT referrals <5 × 3 + fast-breathing referrals 0 × 2 + in the watch window 5 × 1')
  })

  it('draws nothing when every score is 0, and takes a narrower track', () => {
    const zero = doctorOrder([entry('D-D', { urgentReferrals: exact(0), fastBreathing: exact(0), inWatchWindow: exact(0) })])
    expect(zero[0].score).toBe('0')
    expect(zero[0].segments.every((segment) => segment.solid === 0 && segment.dashed === 0)).toBe(true)
    expect(doctorOrder([])).toEqual([])
    const [narrow] = doctorOrder([entry('E-D', { urgentReferrals: exact(0), fastBreathing: exact(0), inWatchWindow: exact(4) })], 200)
    expect(narrow.segments[2].solid).toBe(200)
  })
})
