import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIMIT, MAX_LIMIT, openAgapayDb, type AgapayDb } from './db'
import type { Exposure, Resident, SeedData } from './types'

let opened: AgapayDb[] = []
let counter = 0
async function freshDb() {
  const db = await openAgapayDb(`agapay-test-${counter++}`)
  opened.push(db)
  return db
}
afterEach(() => {
  opened.forEach((db) => db.close())
  opened = []
})

const residentFields = (n: number, householdId = 'HH-01'): Omit<Resident, 'sample'> => ({
  id: `res-${String(n).padStart(3, '0')}`,
  name: `Residente ${String(n).padStart(3, '0')}`,
  householdId,
  purok: 'Purok 1',
  sex: n % 2 ? 'F' : 'M',
  birthDate: '2020-01-15',
})
const resident = (n: number, householdId?: string): Resident => ({ ...residentFields(n, householdId), sample: false })

const exposureFields = (id: string, residentId: string, floodEventId = 'flood-1'): Omit<Exposure, 'sample'> => ({
  id,
  floodEventId,
  residentId,
  exposedOn: '2026-10-07',
  kinds: ['waded'],
  createdAt: '2026-10-07T08:00:00.000Z',
})
const exposure = (id: string, residentId: string, floodEventId?: string): Exposure => ({
  ...exposureFields(id, residentId, floodEventId),
  sample: false,
})

describe('repositories', () => {
  it('puts, gets, counts and deletes records', async () => {
    const db = await freshDb()
    await db.residents.put(resident(1))
    expect(await db.residents.get('res-001')).toMatchObject({ name: 'Residente 001' })
    expect(await db.residents.count()).toBe(1)
    await db.residents.delete('res-001')
    expect(await db.residents.get('res-001')).toBeUndefined()
  })

  it('lists in id order, bounded, and pages with after', async () => {
    const db = await freshDb()
    await db.residents.putMany([3, 1, 2, 5, 4].map((n) => resident(n)))
    expect((await db.residents.list({ limit: 2 })).map((r) => r.id)).toEqual(['res-001', 'res-002'])
    expect((await db.residents.list({ limit: 2, after: 'res-002' })).map((r) => r.id)).toEqual(['res-003', 'res-004'])
    await expect(db.residents.list({ limit: 0 })).rejects.toThrow(RangeError)
  })

  it('never returns more than the limit, and caps the limit', async () => {
    const db = await freshDb()
    await db.residents.putMany(Array.from({ length: DEFAULT_LIMIT + 5 }, (_, i) => resident(i)))
    expect(await db.residents.list()).toHaveLength(DEFAULT_LIMIT)
    expect(await db.residents.list({ limit: MAX_LIMIT * 10 })).toHaveLength(DEFAULT_LIMIT + 5)
  })

  it('queries by index', async () => {
    const db = await freshDb()
    await db.residents.putMany([resident(1, 'HH-01'), resident(2, 'HH-02'), resident(3, 'HH-01')])
    expect((await db.residents.listBy('byHousehold', 'HH-01')).map((r) => r.id)).toEqual(['res-001', 'res-003'])
    await db.exposures.putMany([exposure('e1', 'res-001'), exposure('e2', 'res-002', 'flood-2')])
    expect(await db.exposures.listBy('byFloodEvent', 'flood-2')).toHaveLength(1)
    expect(await db.exposures.listBy('byResident', 'res-001', { limit: 1 })).toHaveLength(1)
  })

  it('tells subscribers when their stores change, until they unsubscribe', async () => {
    const db = await freshDb()
    const listener = vi.fn()
    const unsubscribe = db.subscribe(['residents', 'exposures'], listener)
    await db.residents.put(resident(1))
    await db.exposures.put(exposure('e1', 'res-001'))
    await db.stockLots.putMany([])
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    await db.residents.delete('res-001')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('loadSeed', () => {
  const seed: SeedData = {
    version: 'test-1',
    municipality: 'San Isidro Demo',
    barangay: 'Maligaya-D',
    residents: [1, 2].map((n) => residentFields(n)),
    exposures: [exposureFields('e1', 'res-001')],
  }

  it('writes the seed once, marked as sample data, and records what was loaded', async () => {
    const db = await freshDb()
    expect(await db.getSeedInfo()).toBeNull()
    const listener = vi.fn()
    db.subscribe(['residents'], listener)

    expect(await db.loadSeed(seed, new Date('2026-10-09T08:00:00.000Z'))).toBe(true)
    expect(await db.residents.list()).toEqual([
      expect.objectContaining({ id: 'res-001', sample: true }),
      expect.objectContaining({ id: 'res-002', sample: true }),
    ])
    expect(await db.exposures.get('e1')).toMatchObject({ sample: true })
    expect(await db.getSeedInfo()).toEqual({
      version: 'test-1',
      municipality: 'San Isidro Demo',
      barangay: 'Maligaya-D',
      loadedAt: '2026-10-09T08:00:00.000Z',
    })
    expect(listener).toHaveBeenCalledOnce()

    expect(await db.loadSeed({ ...seed, residents: [{ ...seed.residents[0], id: 'res-999' }] })).toBe(false)
    expect(await db.residents.get('res-999')).toBeUndefined()
  })

  it('keeps data across reopening the database', async () => {
    const name = `agapay-test-${counter++}`
    const first = await openAgapayDb(name)
    await first.loadSeed(seed)
    first.close()
    const second = await openAgapayDb(name)
    opened.push(second)
    expect(await second.residents.count()).toBe(2)
    expect(await second.getSeedInfo()).toMatchObject({ barangay: 'Maligaya-D' })
  })
})
