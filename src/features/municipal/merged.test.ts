import { describe, expect, it } from 'vitest'
import type { ReceivedPayload } from '../../data/db/types'
import { mergedView, priorityReason } from './merged'
import { barangaySlots } from './slots'
import { planShortSummary, planSteps, planStepsText } from './steps'
import { payload, planOf, SAMPLE_NOW, sampleState } from './testSample'
import { reportWeek, weekDaysLabel } from './week'

const at = (barangay: string, epiWeek: string, seq: number, receivedAt: string): ReceivedPayload => ({
  id: `${barangay}:${epiWeek}:${seq}`,
  barangay,
  municipality: 'SID',
  epiWeek,
  seq,
  text: 'AGP1.x.y',
  keyFingerprint: 'F',
  receivedAt,
})

describe('the report week', () => {
  it('names the days of an ISO week, across months and years', () => {
    expect(weekDaysLabel('2026-W41')).toBe('Oct 5 to 11')
    expect(weekDaysLabel('2026-W40')).toBe('Sep 28 to Oct 4')
    expect(weekDaysLabel('2026-W01')).toBe('Dec 29 to Jan 4')
    expect(() => weekDaysLabel('2026-41')).toThrow(RangeError)
  })

  it('is the newest week any barangay sent, or this week when nothing came in', () => {
    expect(reportWeek([{ epiWeek: '2026-W40' }, { epiWeek: '2026-W41' }], new Date(2026, 9, 20))).toBe('2026-W41')
    expect(reportWeek([], new Date(2026, 9, 9))).toBe('2026-W41')
  })
})

describe('the received slots (screens 16–17)', () => {
  it('lists the five barangays in order; a QR from an earlier week is still waiting', async () => {
    const { handoff } = await sampleState()
    const slots = barangaySlots(handoff, '2026-W41')
    expect(slots.slots.map((slot) => [slot.name, slot.thisWeek?.seq ?? null])).toEqual([
      ['Maligaya-D', null],
      ['Bagong Silang-D', 3],
      ['Santo Niño-D', 2],
      ['Mabini-D', 4],
      ['Riverside-D', 2],
    ])
    expect([slots.received, slots.expected]).toEqual([4, 5])
    expect(barangaySlots(handoff, '2026-W42').received).toBe(0)
  })
})

describe('the merged view (screen 18)', () => {
  it('shows each barangay as sent, "<5" as 1–4, totals as ranges, and Maligaya-D waiting', async () => {
    const { handoff, plan } = await sampleState()
    const view = mergedView(plan, handoff.received, { now: SAMPLE_NOW })
    expect(view.rows.map((row) => (row.kind === 'waiting' ? [row.name, 'waiting'] : [row.name, ...Object.values(row.cells)]))).toEqual([
      ['Maligaya-D', 'waiting'],
      ['Bagong Silang-D', '142–145', '64', '9–15', '10', '0'],
      ['Santo Niño-D', '62–65', '27', '2–8', '60', '0'],
      ['Mabini-D', '32–38', '11', '5', '24', '0'],
      ['Riverside-D', '2–8', '1–4', '1–4', '50', '30'],
    ])
    expect(view.totalLabel).toBe('4 of 5 barangays')
    expect(view.totals).toEqual({
      exposed: '238–256',
      inWatchWindow: '103–106',
      fastBreathing: '17–32',
      doxyOnHand: '144',
      doxyExpiring: '30',
    })
    const received = view.rows.filter((row) => row.kind === 'received')
    expect(received.map((row) => row.priority)).toEqual([true, false, false, false])
    expect(received.map((row) => row.expiring)).toEqual([false, false, false, true])
    expect(received[0].received).toMatch(/^\d{1,2}:\d{2} [AP]M · #3$/)
    expect(view.why).toEqual({
      name: 'Bagong Silang-D',
      reason: 'the most residents in the watch window (64), fast-breathing referrals (9–15), and URGENT referrals (5).',
    })
  })

  it('reads like the design for the design’s Maligaya-D row, and says "All 5" when all are in', () => {
    const plan = planOf([
      payload('SID-MAL', {
        exposed: { under2m: 0, m2to12: 1, y1to5: 0, y5to17: 0, y18to59: 6, y60plus: 1 },
        inWatchWindow: 9,
        fastBreathing: { under2m: 0, m2to12: 0, y1to5: 2 },
        doxyCapsulesOnHand: 40,
        doxyCapsulesExpiring6w: 30,
      }),
      payload('SID-BGS', { exposed: { under2m: 0, m2to12: 0, y1to5: 0, y5to17: 0, y18to59: 2, y60plus: 0 }, doxyCapsulesOnHand: 120 }),
      payload('SID-STN', { inWatchWindow: 5 }),
      payload('SID-MAB', { doxyCapsulesExpiring6w: 10, doxyCapsulesOnHand: 35 }),
      payload('SID-RIV', { inWatchWindow: 6 }),
    ])
    const received = ['SID-MAL', 'SID-BGS', 'SID-STN', 'SID-MAB', 'SID-RIV'].map((code) =>
      at(code, '2026-W41', 1, '2026-10-10T01:05:00.000Z'),
    )
    const view = mergedView(plan, received)
    const maligaya = view.rows[0]
    expect(maligaya).toMatchObject({ kind: 'received', priority: true, expiring: true })
    if (maligaya.kind !== 'received') throw new Error('expected a row')
    expect(maligaya.cells).toEqual({ exposed: '8–14', inWatchWindow: '9', fastBreathing: '1–4', doxyOnHand: '40', doxyExpiring: '30' })
    expect(view.totalLabel).toBe('All 5 barangays')
    expect(view.totals.exposed).toBe('9–18')
    expect(view.why?.reason).toBe(
      'the most residents in the watch window (9), fast-breathing referrals (1–4), and 30 of its 40 capsules expire within 6 weeks.',
    )
    expect(priorityReason(plan, plan.rows.find((row) => row.barangay === 'SID-MAL')!, 'step')).toBe(
      '9 residents in the watch window, fast-breathing referrals (1–4), 30 of 40 capsules expire within 6 weeks.',
    )
  })

  it('names no priority when nobody needs a doctor team, and shows dashes before any QR', () => {
    const quiet = planOf([payload('SID-MAL', { doxyCapsulesOnHand: 20 }), payload('SID-BGS', {})])
    const view = mergedView(quiet, [])
    expect(view.why).toBeNull()
    expect(view.rows.some((row) => row.kind === 'received' && row.priority)).toBe(false)
    expect(planSteps(quiet)[0]).toEqual({ title: 'No doctor team needed yet.', reason: '' })

    const empty = mergedView(null, [])
    expect(empty.rows.every((row) => row.kind === 'waiting')).toBe(true)
    expect(empty.totalLabel).toBe('0 of 5 barangays')
    expect(empty.totals.exposed).toBe('–')
  })

  it('never calls a tie "the most"', () => {
    const plan = planOf([payload('SID-MAL', { inWatchWindow: 9 }), payload('SID-BGS', { inWatchWindow: 9 })])
    expect(mergedView(plan, []).why?.reason).toBe('9 residents in the watch window.')
  })
})

describe('the plan steps (screen 19) and the log summary (screen 20)', () => {
  it('lists the doctor team, the stock move with its reason, and the capsules to use first', async () => {
    const { plan } = await sampleState()
    expect(planSteps(plan)).toEqual([
      {
        title: 'Send a doctor team to Bagong Silang-D first.',
        reason: '64 residents in the watch window, fast-breathing referrals (9–15), URGENT referrals (5).',
      },
      {
        title: 'Move 30 capsules from Riverside-D to Bagong Silang-D.',
        reason: 'Riverside-D has 50 capsules, 3–12 people exposed and 1–4 in the watch window.',
      },
      { title: 'Use the 30 capsules that expire within 6 weeks first.', reason: 'Riverside-D 30.' },
    ])
    expect(planShortSummary(plan)).toBe(
      '1. Doctor team to Bagong Silang-D first. 2. Move 30 capsules from Riverside-D to Bagong Silang-D. 3. Use the 30 expiring capsules first.',
    )
    expect(planStepsText(plan).split('\n')[0]).toBe(
      '1. Send a doctor team to Bagong Silang-D first. 64 residents in the watch window, fast-breathing referrals (9–15), URGENT referrals (5).',
    )
  })

  it('never mentions a dose', async () => {
    const { plan } = await sampleState()
    expect(planStepsText(plan)).not.toMatch(/\bdos(e|es|age|ing)\b|\bmg\b|per person/i)
  })
})
