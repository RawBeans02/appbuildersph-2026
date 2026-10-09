import { describe, expect, it } from 'vitest'
import type { Approval, Plan } from '../../data/db/types'
import type { MunicipalPlan } from '../../rules/plan'
import { arrivals, latestApproval, loopModel, stepForScreen } from './loop'
import type { LogEntry } from './municipal'
import type { BarangaySlot, Slots } from './slots'

// The LoopStrip's steps from the records: reports in, merged, plan, approved,
// back to the barangay.

const slot = (barangay: string, received: boolean): BarangaySlot => {
  const item = { id: `${barangay}:2026-W41:1`, barangay, municipality: 'SID', epiWeek: '2026-W41', seq: 1, text: '', keyFingerprint: 'K', receivedAt: '2026-10-09T01:00:00.000Z' }
  return { barangay, name: barangay, latest: received ? item : null, thisWeek: received ? item : null }
}

const slots = (received: number): Slots => {
  const list = ['A', 'B', 'C', 'D', 'E'].map((code, i) => slot(code, i < received))
  return { week: '2026-W41', slots: list, received, expected: 5 }
}

const entry = (id: string, approvedAt: string, epiWeek: string | null): LogEntry => ({
  approval: { id, approvedAt, approver: 'Municipal health officer', planSummary: '', note: '', sample: false } as Approval,
  plan: epiWeek ? ({ id, epiWeek } as Plan) : null,
})

// planSteps reads the plan's rows, priority, moves and totals; an empty plan
// with rows gives one step ("No doctor team needed yet.").
const plan = (rows: number) =>
  ({
    epiWeek: '2026-W41',
    rows: Array.from({ length: rows }, (_, i) => ({ barangay: `B${i}` })),
    priority: [],
    moves: [],
    totals: { doxyCapsulesExpiring6w: { min: 0, max: 0 } },
  }) as unknown as MunicipalPlan

const time = (iso: string) => `at ${iso}`

describe('loopModel', () => {
  it('the demo start: 4 of 5 in, merged and planned, not approved yet', () => {
    const model = loopModel({ slots: slots(4), plan: plan(4), log: [], formatTime: time })
    expect(model.steps.map(({ id, status, state }) => [id, status, state])).toEqual([
      ['reports', '4 of 5', 'reached'],
      ['merged', '4 barangays', 'done'],
      ['plan', '1 step', 'done'],
      ['approved', 'Not yet', 'waiting'],
      ['back', 'After approval', 'waiting'],
    ])
    expect(model.meter.map((seg) => seg.received)).toEqual([true, true, true, true, false])
    expect(model.approvalId).toBeNull()
  })

  it('nothing in yet: every step waits', () => {
    const model = loopModel({ slots: slots(0), plan: null, log: [], formatTime: time })
    expect(model.steps.map(({ status, state }) => [status, state])).toEqual([
      ['0 of 5', 'waiting'],
      ['Waiting for reports', 'waiting'],
      ['No reports yet', 'waiting'],
      ['Not yet', 'waiting'],
      ['After approval', 'waiting'],
    ])
  })

  it('5 of 5 and approved this week: the latest approval’s time, and the return QR is ready', () => {
    const log = [
      entry('old', '2026-10-09T02:00:00.000Z', '2026-W41'),
      entry('new', '2026-10-10T02:52:00.000Z', '2026-W41'),
      entry('last-week', '2026-10-11T00:00:00.000Z', '2026-W40'),
    ]
    const model = loopModel({ slots: slots(5), plan: plan(5), log, formatTime: time })
    expect(model.steps.map(({ status, state }) => [status, state])).toEqual([
      ['5 of 5', 'done'],
      ['5 barangays', 'done'],
      ['1 step', 'done'],
      ['at 2026-10-10T02:52:00.000Z', 'done'],
      ['Return QR ready', 'reached'],
    ])
    expect(model.approvalId).toBe('new')
  })

  it('an approval from another week does not count', () => {
    const model = loopModel({ slots: slots(5), plan: plan(5), log: [entry('w40', '2026-10-02T02:00:00.000Z', '2026-W40')], formatTime: time })
    expect(model.steps[3]).toMatchObject({ status: 'Not yet', state: 'waiting' })
    expect(model.steps[4]).toMatchObject({ status: 'After approval', state: 'waiting' })
  })

  it('an approval without its plan counts by the week it was approved in', () => {
    expect(latestApproval([entry('x', '2026-10-07T02:00:00.000Z', null)], '2026-W41')?.approval.id).toBe('x')
    expect(latestApproval([entry('x', '2026-10-01T02:00:00.000Z', null)], '2026-W41')).toBeNull()
  })
})

describe('stepForScreen', () => {
  it('maps each laptop screen to its step; the return QR is step 5, sync has none', () => {
    expect(stepForScreen('scan', '/municipal')).toBe('reports')
    expect(stepForScreen('merged', '/municipal/merged')).toBe('merged')
    expect(stepForScreen('plan', '/municipal/plan')).toBe('plan')
    expect(stepForScreen('log', '/municipal/log')).toBe('approved')
    expect(stepForScreen('plan', '/municipal/return')).toBe('back')
    expect(stepForScreen('sync', '/municipal/sync')).toBeNull()
  })
})

describe('arrivals', () => {
  it('nothing arrives with the first list; later, only the new keys', () => {
    expect(arrivals(null, ['A', 'B'])).toEqual([])
    expect(arrivals(['A', 'B'], ['A', 'B', 'E'])).toEqual(['E'])
    expect(arrivals(['A', 'B'], ['A'])).toEqual([])
  })
})
