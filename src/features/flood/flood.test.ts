import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { openAgapayDb, type AgapayDb } from '../../data/db/db'
import type { FloodEvent, Resident } from '../../data/db/types'
import { currentFlood, groupHouseholds, logFlood, markHouseholdExposed, undoHouseholdExposure } from './flood'

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
  it('marks every member of a tapped household once per day, and undoes it', async () => {
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
    expect(await undoHouseholdExposure(db, { floodEventId: flood.id, household })).toBe(4)
    expect(await db.exposures.count()).toBe(0)
  })
})
