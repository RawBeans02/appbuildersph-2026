import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { openAgapayDb, type AgapayDb } from '../../data/db/db'
import type { Exposure, ExposureKind, FloodEvent, Resident } from '../../data/db/types'
import { watchList } from '../../rules/watch'
import {
  currentFlood,
  exposedBefore,
  groupHouseholds,
  householdsByPurok,
  logFlood,
  markHouseholdExposed,
  marksOn,
  planMarks,
  puroksOf,
  saveMarks,
  undoHouseholdExposure,
  type Marks,
} from './flood'

const resident = (id: string, householdId: string, purok = 'Purok 1'): Resident => ({
  id,
  name: `Residente ${id}`,
  householdId,
  purok,
  sex: 'F',
  birthDate: '1990-01-01',
  sample: true,
})

let db: AgapayDb
let n = 0
afterEach(() => db?.close())

describe('groupHouseholds', () => {
  it('groups residents by household, sorted by purok then id', () => {
    const households = groupHouseholds([
      resident('3', 'HH-02', 'Purok 2'),
      resident('1', 'HH-01'),
      resident('2', 'HH-01'),
    ])
    expect(households.map((h) => [h.id, h.members.length])).toEqual([
      ['HH-01', 2],
      ['HH-02', 1],
    ])
  })
})

describe('puroks', () => {
  const residents = [
    resident('1', 'HH-01', 'Purok 2'),
    resident('2', 'HH-02', 'Purok 10'),
    resident('3', 'HH-03', 'Purok 1'),
    resident('4', 'HH-04', 'Purok 2'),
  ]

  it('lists the residents’ puroks once each, in number order', () => {
    expect(puroksOf(residents)).toEqual(['Purok 1', 'Purok 2', 'Purok 10'])
  })

  it('groups households by purok with the areas that had floodwater first', () => {
    const groups = householdsByPurok(groupHouseholds(residents), ['Purok 10'])
    expect(groups.map((g) => [g.purok, g.households.map((h) => h.id)])).toEqual([
      ['Purok 10', ['HH-02']],
      ['Purok 1', ['HH-03']],
      ['Purok 2', ['HH-01', 'HH-04']],
    ])
  })
})

describe('currentFlood', () => {
  const flood = (id: string, startedOn: string, endedOn: string | null = null): FloodEvent => ({
    id,
    startedOn,
    endedOn,
    note: '',
    createdAt: '',
    sample: false,
  })
  it('is the latest flood that has not ended', () => {
    expect(currentFlood([flood('a', '2026-09-01'), flood('b', '2026-10-01'), flood('c', '2026-10-05', '2026-10-06')])?.id).toBe('b')
    expect(currentFlood([])).toBeNull()
  })
})

describe('exposures', () => {
  it('logs a flood with its areas', async () => {
    db = await openAgapayDb(`flood-test-${n++}`)
    const flood = await logFlood(db, { startedOn: '2026-10-04', puroks: ['Purok 3', 'Purok 1', 'Purok 3'] })
    expect(await db.floodEvents.get(flood.id)).toMatchObject({ startedOn: '2026-10-04', note: '', puroks: ['Purok 1', 'Purok 3'] })
  })

  it('marks every member of a tapped household once per day, and undoes only that day', async () => {
    db = await openAgapayDb(`flood-test-${n++}`)
    const [household] = groupHouseholds([resident('r1', 'HH-01'), resident('r2', 'HH-01')])
    const flood = await logFlood(db, { startedOn: '2026-10-07', note: ' Typhoon Demo ' })
    expect(flood).toMatchObject({ note: 'Typhoon Demo', endedOn: null, sample: false })

    const input = { floodEventId: flood.id, household, exposedOn: '2026-10-07', kinds: [] }
    expect(await markHouseholdExposed(db, input)).toBe(2)
    expect(await markHouseholdExposed(db, input)).toBe(0)
    const exposures = await db.exposures.listBy('byFloodEvent', flood.id)
    expect(exposures.map((e) => [e.residentId, e.kinds])).toEqual(
      expect.arrayContaining([
        ['r1', ['waded']],
        ['r2', ['waded']],
      ]),
    )

    expect(await markHouseholdExposed(db, { ...input, exposedOn: '2026-10-08', kinds: ['open-wound'] })).toBe(2)
    expect(await undoHouseholdExposure(db, { floodEventId: flood.id, household, exposedOn: '2026-10-08' })).toBe(2)
    expect((await db.exposures.list()).map((e) => e.exposedOn)).toEqual(['2026-10-07', '2026-10-07'])
  })

  it('keeps an earlier day of contact when today’s tap is undone, and a second day makes it repeated', async () => {
    db = await openAgapayDb(`flood-test-${n++}`)
    const households = groupHouseholds([resident('r1', 'HH-01'), resident('r2', 'HH-01')])
    const flood = await logFlood(db, { startedOn: '2026-10-04' })
    const base = { floodEventId: flood.id, households, exposedOn: '2026-10-10' }
    await markHouseholdExposed(db, { floodEventId: flood.id, household: households[0], exposedOn: '2026-10-04', kinds: ['waded'] })

    // On Oct 10 the household isn't marked for today, only exposed before.
    let exposures = await db.exposures.list()
    expect(marksOn(exposures, flood.id, households, '2026-10-10').size).toBe(0)
    expect(exposedBefore(exposures, flood.id, households, '2026-10-10')).toEqual(new Map([['HH-01', '2026-10-04']]))

    // Marking it today adds a second day: the watch list counts it as repeated.
    const today: Marks = new Map([['HH-01', ['waded']]])
    expect(await saveMarks(db, { ...base, before: new Map(), after: today })).toBe(2)
    exposures = await db.exposures.list()
    expect(watchList(exposures, '2026-10-10')[0]).toMatchObject({
      firstExposedOn: '2026-10-04',
      lastExposedOn: '2026-10-10',
      kinds: ['waded', 'repeated'],
      higherRisk: true,
    })

    // Unmarking it today removes today's contact only.
    const before = marksOn(exposures, flood.id, households, '2026-10-10')
    expect(before).toEqual(today)
    expect(await saveMarks(db, { ...base, before, after: new Map() })).toBe(0)
    exposures = await db.exposures.list()
    expect(exposures).toHaveLength(2)
    expect(exposures.every((e) => e.exposedOn === '2026-10-04')).toBe(true)
  })

  it('changes the details of today’s marks', async () => {
    db = await openAgapayDb(`flood-test-${n++}`)
    const households = groupHouseholds([resident('r1', 'HH-01'), resident('r2', 'HH-02')])
    const flood = await logFlood(db, { startedOn: '2026-10-04' })
    const base = { floodEventId: flood.id, households, exposedOn: '2026-10-04' }
    const first: Marks = new Map([
      ['HH-01', ['waded']],
      ['HH-02', ['waded', 'open-wound']],
    ])
    expect(await saveMarks(db, { ...base, before: new Map(), after: first })).toBe(2)
    const second: Marks = new Map([['HH-01', ['waded', 'repeated']]])
    expect(await saveMarks(db, { ...base, before: first, after: second })).toBe(0)
    const exposures = await db.exposures.list()
    expect(exposures.map((e: Exposure) => [e.residentId, e.kinds])).toEqual([['r1', ['waded', 'repeated']]])
  })
})

describe('planMarks', () => {
  const marks = (entries: [string, ExposureKind[]][]): Marks => new Map(entries)
  it('adds new households, updates changed details, and removes unmarked ones', () => {
    const plan = planMarks(
      marks([
        ['HH-01', ['waded']],
        ['HH-02', ['waded']],
        ['HH-03', ['open-wound', 'waded']],
      ]),
      marks([
        ['HH-01', ['waded', 'open-wound']],
        ['HH-03', ['waded', 'open-wound']],
        ['HH-04', ['repeated']],
      ]),
    )
    expect(plan).toEqual({
      add: [['HH-04', ['waded', 'repeated']]],
      update: [['HH-01', ['waded', 'open-wound']]],
      remove: ['HH-02'],
    })
  })
})
