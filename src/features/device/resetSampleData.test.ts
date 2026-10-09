import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { openAgapayDb } from '../../data/db/db'
import type { DeviceIdentity, SeedData } from '../../data/db/types'
import { resetSampleData } from './resetSampleData'

const seedFor = (version: string): SeedData => ({
  version,
  municipality: 'San Isidro Demo',
  barangay: 'Maligaya-D',
  residents: [{ id: 'res-001', name: 'Residente 001', householdId: 'HH-01', purok: 'Purok 1', sex: 'F', birthDate: '2024-01-01' }],
  floodEvents: [{ id: 'flood-1', startedOn: '2026-10-04', endedOn: null, note: '', createdAt: '' }],
})

async function rehearsedDb(name: string) {
  const db = await openAgapayDb(name)
  await db.loadSeed(seedFor('yesterday'))
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const identity: DeviceIdentity = {
    id: 'self',
    barangay: 'SID-MAL',
    privateKey: keys.privateKey,
    publicJwk: { kty: 'EC' },
    fingerprint: 'AAAA',
    nextSeq: 4,
    createdAt: '',
  }
  await db.putDeviceIdentity(identity)
  await db.stockLots.put({
    id: 'scanned',
    drug: 'Doxycycline',
    strength: '100 mg',
    lot: 'DEMO-LOT-24A',
    expiry: '2026-11',
    quantity: 30,
    unit: 'capsule',
    source: 'ocr',
    ocrConfidence: null,
    confirmedAt: '',
    sample: false,
  })
  await db.flags.put({ id: 'f1', kind: 'clinician-review', createdAt: '', reason: '', details: {}, status: 'open', sample: false })
  await db.pairedDevices.putMany([
    { barangay: 'SID-MAL', publicJwk: { kty: 'EC' }, fingerprint: 'AAAA', pairedAt: '', source: 'pairing' },
    { barangay: 'SID-BGS', publicJwk: { kty: 'EC' }, fingerprint: 'BBBB', pairedAt: '', source: 'seed' },
  ])
  await db.receivedPayloads.put({
    id: 'SID-MAL:2026-W41:3',
    barangay: 'SID-MAL',
    municipality: 'SID',
    epiWeek: '2026-W41',
    seq: 3,
    text: 'AGP1.x.y',
    keyFingerprint: 'AAAA',
    receivedAt: '',
  })
  await db.plans.put({ id: 'p1', epiWeek: '2026-W41', createdAt: '', rules: {}, draftText: null, draftSource: null, finalText: '', status: 'approved' })
  await db.approvals.put({ id: 'a1', approvedAt: '', approver: 'MHO', planSummary: '', note: '', sample: false })
  return db
}

describe('resetSampleData', () => {
  it("replaces every record with today's seed and reloads the municipal sample, keeping this phone's key and real pairings", async () => {
    const db = await rehearsedDb('reset-test-1')
    const loadMunicipalSample = vi.fn(async () => true)
    await resetSampleData(db, { resetPairing: false, makeSeed: () => seedFor('today'), loadMunicipalSample })

    expect((await db.getSeedInfo())?.version).toBe('today')
    expect(await db.residents.count()).toBe(1)
    for (const store of ['stockLots', 'flags', 'approvals', 'receivedPayloads', 'plans'] as const) {
      expect(await db[store].count(), store).toBe(0)
    }
    expect((await db.getDeviceIdentity())?.fingerprint).toBe('AAAA')
    expect((await db.pairedDevices.list()).map((d) => d.barangay)).toEqual(['SID-MAL'])
    expect(loadMunicipalSample).toHaveBeenCalledWith(db)
    db.close()
  })

  it('also forgets the signing key and every paired phone when asked to reset pairing', async () => {
    const db = await rehearsedDb('reset-test-2')
    await resetSampleData(db, { resetPairing: true, makeSeed: () => seedFor('today'), loadMunicipalSample: async () => true })
    expect(await db.getDeviceIdentity()).toBeNull()
    expect(await db.pairedDevices.count()).toBe(0)
    db.close()
  })

  it('tells open screens to re-read', async () => {
    const db = await rehearsedDb('reset-test-3')
    const listener = vi.fn()
    db.subscribe(['stockLots'], listener)
    await resetSampleData(db, { resetPairing: false, makeSeed: () => seedFor('today'), loadMunicipalSample: async () => true })
    expect(listener).toHaveBeenCalled()
    db.close()
  })
})
