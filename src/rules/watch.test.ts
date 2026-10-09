import { describe, expect, it } from 'vitest'
import type { Exposure, ExposureKind } from '../data/db/types'
import { watchedCount, watchList, watchWindow } from './watch'

let n = 0
const exposure = (residentId: string, exposedOn: string, kinds: ExposureKind[] = ['waded']): Exposure => ({
  id: `e${n++}`,
  floodEventId: 'flood-1',
  residentId,
  exposedOn,
  kinds,
  createdAt: `${exposedOn}T08:00:00.000Z`,
  sample: false,
})

describe('watchList', () => {
  it('opens the window on day 5 and closes it after day 15, inclusive', () => {
    const exposures = [exposure('r1', '2026-10-01')]
    const phase = (today: string) => watchList(exposures, today)[0]
    expect(phase('2026-10-05')).toMatchObject({ phase: 'upcoming', daysToStart: 1, windowStart: '2026-10-06' })
    expect(phase('2026-10-06')).toMatchObject({ phase: 'active', daysLeft: 10 })
    expect(phase('2026-10-16')).toMatchObject({ phase: 'active', daysLeft: 0, windowEnd: '2026-10-16' })
    expect(phase('2026-10-17')).toMatchObject({ phase: 'ended' })
  })

  it('watches a resident exposed on several days from the first contact to the last, as repeated', () => {
    const [entry] = watchList(
      [exposure('r1', '2026-10-03'), exposure('r1', '2026-10-01'), exposure('r1', '2026-10-03')],
      '2026-10-10',
    )
    expect(entry).toMatchObject({
      firstExposedOn: '2026-10-01',
      lastExposedOn: '2026-10-03',
      windowStart: '2026-10-06',
      windowEnd: '2026-10-18',
      kinds: ['waded', 'repeated'],
      higherRisk: true,
    })
  })

  it('treats an open wound as higher risk, and a single wade as not', () => {
    const list = watchList([exposure('r1', '2026-10-01'), exposure('r2', '2026-10-01', ['waded', 'open-wound'])], '2026-10-08')
    expect(list.map((e) => [e.residentId, e.higherRisk])).toEqual([
      ['r2', true],
      ['r1', false],
    ])
  })

  it('lists active windows first, then upcoming, then ended', () => {
    const list = watchList(
      [exposure('ended', '2026-09-01'), exposure('upcoming', '2026-10-08'), exposure('active', '2026-10-01')],
      '2026-10-09',
    )
    expect(list.map((e) => e.phase)).toEqual(['active', 'upcoming', 'ended'])
    expect(watchedCount(list)).toBe(2)
  })

  it('counts the row day from the last contact, so day 15 is the last day of the window', () => {
    const single = (today: string) => watchList([exposure('r1', '2026-10-04')], today)[0]
    expect(single('2026-10-10')).toMatchObject({ day: 6, phase: 'active' })
    expect(single('2026-10-19')).toMatchObject({ day: 15, daysLeft: 0, phase: 'active' })
    const [twoDays] = watchList([exposure('r1', '2026-10-04'), exposure('r1', '2026-10-06')], '2026-10-21')
    expect(twoDays).toMatchObject({ day: 15, daysLeft: 0, windowEnd: '2026-10-21' })
  })

  it('gives the window for one day of contact, or several', () => {
    expect(watchWindow('2026-10-04')).toEqual({ start: '2026-10-09', end: '2026-10-19' })
    expect(watchWindow('2026-10-04', '2026-10-06')).toEqual({ start: '2026-10-09', end: '2026-10-21' })
  })

  it('returns nothing without exposures', () => {
    expect(watchList([], '2026-10-09')).toEqual([])
  })
})
