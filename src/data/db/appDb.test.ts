import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { openAppDb } from './appDb'
import type { SeedData } from './types'

const seed: SeedData = {
  version: 'test-1',
  municipality: 'San Isidro Demo',
  barangay: 'Maligaya-D',
  residents: [
    { id: 'res-001', name: 'Residente 001', householdId: 'HH-01', purok: 'Purok 1', sex: 'F', birthDate: '2023-04-02' },
  ],
}

describe('openAppDb', () => {
  it('loads the seed on first run only, and skips importing it afterwards', async () => {
    const loadSeed = vi.fn(async () => seed)
    const first = await openAppDb('app-db-test-1', loadSeed)
    expect(await first.residents.get('res-001')).toMatchObject({ sample: true })
    first.close()

    const second = await openAppDb('app-db-test-1', loadSeed)
    expect(loadSeed).toHaveBeenCalledOnce()
    expect(await second.getSeedInfo()).toMatchObject({ barangay: 'Maligaya-D' })
    second.close()
  })

  it('starts empty when there is no seed yet', async () => {
    const db = await openAppDb('app-db-test-2', async () => null)
    expect(await db.residents.count()).toBe(0)
    expect(await db.getSeedInfo()).toBeNull()
    db.close()
  })
})
