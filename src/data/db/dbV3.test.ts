import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it } from 'vitest'
import { openAgapayDb } from './db'
import type { WatchCheck } from './types'

const check = (id: string, residentId: string, checkedAt: string): WatchCheck => ({
  id,
  residentId,
  checkedAt,
  result: 'no-signs',
  sample: false,
})

describe('database version 3', () => {
  it('adds the watch checks store to a version-2 database without losing its records', async () => {
    const name = 'db-v3-upgrade'
    const v2 = await openDB(name, 2, {
      upgrade(database) {
        database.createObjectStore('residents', { keyPath: 'id' }).createIndex('byHousehold', 'householdId')
        database.createObjectStore('floodEvents', { keyPath: 'id' }).createIndex('byStartedOn', 'startedOn')
        database.createObjectStore('meta')
      },
    })
    await v2.put('residents', { id: 'res-001', name: 'Residente 001', householdId: 'HH-01' })
    await v2.put('floodEvents', { id: 'flood-1', startedOn: '2026-10-04', endedOn: null, note: '', createdAt: '', sample: true })
    v2.close()

    const db = await openAgapayDb(name)
    expect(await db.residents.get('res-001')).toMatchObject({ name: 'Residente 001' })
    // A flood saved before puroks existed still reads, without them.
    expect((await db.floodEvents.get('flood-1'))?.puroks).toBeUndefined()
    expect(await db.watchChecks.count()).toBe(0)
    db.close()
  })

  it('keeps watch checks by resident, and empties them on reset', async () => {
    const db = await openAgapayDb('db-v3-checks')
    await db.watchChecks.putMany([
      check('c1', 'res-001', '2026-10-09T08:15:00.000Z'),
      check('c2', 'res-002', '2026-10-09T08:20:00.000Z'),
      check('c3', 'res-001', '2026-10-10T08:15:00.000Z'),
    ])
    expect((await db.watchChecks.listBy('byResident', 'res-001')).map((c) => c.id)).toEqual(['c1', 'c3'])

    await db.clearForReset({ resetPairing: false })
    expect(await db.watchChecks.count()).toBe(0)
    db.close()
  })
})
