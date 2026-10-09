import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it } from 'vitest'
import { openAgapayDb } from './db'
import type { DeviceIdentity, ReceivedPayload } from './types'

async function identity(): Promise<DeviceIdentity> {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  return {
    id: 'self',
    barangay: 'SID-MAL',
    privateKey: keys.privateKey,
    publicJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
    fingerprint: '3109-7D1D-0CAB-216B',
    nextSeq: 1,
    createdAt: '2026-10-09T10:00:00.000Z',
  }
}

describe('database version 2', () => {
  it('upgrades a version-1 database without losing its records', async () => {
    const name = 'db-v2-upgrade'
    const v1 = await openDB(name, 1, {
      upgrade(database) {
        database.createObjectStore('residents', { keyPath: 'id' }).createIndex('byHousehold', 'householdId')
        database.createObjectStore('meta')
      },
    })
    await v1.put('residents', { id: 'res-001', name: 'Residente 001', householdId: 'HH-01' })
    v1.close()

    const db = await openAgapayDb(name)
    expect(await db.residents.get('res-001')).toMatchObject({ name: 'Residente 001' })
    expect(await db.receivedPayloads.count()).toBe(0)
    expect(await db.getDeviceIdentity()).toBeNull()
    db.close()
  })

  it('keeps the phone identity with its non-extractable key usable, and hands out export numbers from 1', async () => {
    const db = await openAgapayDb('db-v2-identity')
    await expect(db.takeExportSeq()).rejects.toThrow('no device identity')
    await db.putDeviceIdentity(await identity())

    const stored = await db.getDeviceIdentity()
    expect(stored?.privateKey.extractable).toBe(false)
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, stored!.privateKey, new Uint8Array([1, 2, 3]))
    expect(signature.byteLength).toBeGreaterThan(0)

    expect(await db.takeExportSeq()).toBe(1)
    expect(await db.takeExportSeq()).toBe(2)
    expect((await db.getDeviceIdentity())?.nextSeq).toBe(3)
    db.close()
  })

  it('stores received payloads, paired devices and plans, with their indexes', async () => {
    const db = await openAgapayDb('db-v2-laptop')
    const received = (barangay: string, epiWeek: string, seq: number): ReceivedPayload => ({
      id: `${barangay}:${epiWeek}:${seq}`,
      barangay,
      municipality: 'SID',
      epiWeek,
      seq,
      text: 'AGP1.x.y',
      keyFingerprint: 'F',
      receivedAt: '2026-10-09T10:00:00.000Z',
    })
    await db.receivedPayloads.putMany([received('SID-MAL', '2026-W41', 1), received('SID-BAG', '2026-W41', 3), received('SID-MAL', '2026-W40', 1)])
    expect(await db.receivedPayloads.listBy('byEpiWeek', '2026-W41')).toHaveLength(2)
    expect(await db.receivedPayloads.listBy('byBarangay', 'SID-MAL')).toHaveLength(2)

    await db.pairedDevices.put({ barangay: 'SID-MAL', publicJwk: { kty: 'EC' }, fingerprint: 'F', pairedAt: '2026-10-09', source: 'pairing' })
    expect(await db.pairedDevices.get('SID-MAL')).toMatchObject({ source: 'pairing' })

    await db.plans.put({
      id: 'plan-1',
      epiWeek: '2026-W41',
      createdAt: '2026-10-09T11:00:00.000Z',
      rules: { teams: ['SID-MAL'] },
      draftText: null,
      draftSource: null,
      finalText: 'Send a doctor team to Maligaya-D.',
      status: 'draft',
    })
    expect(await db.plans.listBy('byEpiWeek', '2026-W41')).toHaveLength(1)
    db.close()
  })
})
