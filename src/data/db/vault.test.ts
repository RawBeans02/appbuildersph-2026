import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { generateSeed } from '../seed/generate'
import { openAgapayDb, type AgapayDb } from './db'
import { loadSampleSeed } from './sampleSeed'
import type { HingaCheck, Resident } from './types'
import {
  createLock,
  DEMO_PIN,
  lockIdOf,
  deriveKey,
  isValidPin,
  keyForPin,
  LockedError,
  openValue,
  sealValue,
  session,
  wrongPinDelayMs,
} from './vault'

// Few iterations keep the tests fast; the app uses PBKDF2_ITERATIONS.
const FAST = 1_000

const resident: Resident = {
  id: 'res-001',
  name: 'Residente 001',
  householdId: 'HH-01',
  purok: 'Purok 1',
  sex: 'F',
  birthDate: '2025-04-02',
  sample: false,
}

afterEach(() => session.clear())

describe('vault', () => {
  it('derives a non-extractable AES-GCM key and seals each value with its own 96-bit IV', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey('2468', salt, FAST)
    expect(key.extractable).toBe(false)
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
    const a = await sealValue(key, { name: 'Residente 001' })
    const b = await sealValue(key, { name: 'Residente 001' })
    expect(a.iv).toHaveLength(12)
    expect([...a.iv]).not.toEqual([...b.iv])
    expect(new TextDecoder().decode(a.data)).not.toContain('Residente')
    expect(await openValue(key, a)).toEqual({ name: 'Residente 001' })
  })

  it('tells the right PIN from a wrong one by the verifier, never storing the PIN', async () => {
    const { lock } = await createLock('482913', { iterations: FAST })
    expect(JSON.stringify(lock)).not.toContain('482913')
    expect(lock.salt).toHaveLength(16)
    expect(await keyForPin(lock, '482913')).not.toBeNull()
    expect(await keyForPin(lock, '482914')).toBeNull()
    expect(await keyForPin(lock, 'abcd')).toBeNull()
  })

  it('accepts 4 to 6 digits only', async () => {
    expect(['1234', '123456'].map(isValidPin)).toEqual([true, true])
    expect(['123', '1234567', '12a4', ''].map(isValidPin)).toEqual([false, false, false, false])
    await expect(createLock('12', { iterations: FAST })).rejects.toThrow(RangeError)
  })

  it('waits longer after each wrong PIN, from the third, up to 5 minutes', () => {
    expect([1, 2, 3, 4, 5, 12].map(wrongPinDelayMs)).toEqual([0, 0, 5_000, 10_000, 20_000, 300_000])
  })
})

// Saves a lock with this PIN and opens it in this page, as unlocking does.
async function unlockWith(db: AgapayDb, pin = '2468') {
  const { lock, key } = await createLock(pin, { iterations: FAST })
  await db.putLock(lock)
  session.set(key, lockIdOf(lock))
  return { lock, key }
}

const rawRecord = async (name: string, store: string, id: string) => {
  const raw = await openDB(name)
  const record = await raw.get(store, id)
  raw.close()
  return record
}

describe('encrypted records', () => {
  it("seals a resident's personal fields at rest and reads them back while unlocked", async () => {
    const name = 'enc-residents'
    const db = await openAgapayDb(name, { encryption: true })
    await unlockWith(db)
    await db.residents.put(resident)

    // At rest: the id stays plain (indexes and links work), the rest is sealed.
    const stored = await rawRecord(name, 'residents', 'res-001')
    expect(Object.keys(stored).sort()).toEqual(['id', 'sample', 'sealed'])
    expect(JSON.stringify(stored)).not.toMatch(/Residente|HH-01|Purok|2025-04-02/)

    expect(await db.residents.get('res-001')).toEqual(resident)
    expect(await db.residents.list()).toEqual([resident])
  })

  it('keeps index keys plain, so lookups by resident still work', async () => {
    const db = await openAgapayDb('enc-hinga', { encryption: true })
    await unlockWith(db)
    const check: HingaCheck = {
      id: 'h-1',
      residentId: 'res-001',
      checkedAt: '2026-10-09T08:00:00.000Z',
      ageMonths: 18,
      breathsPerMinute: 45,
      outcome: 'fast',
      refusal: null,
      dangerSigns: [],
      method: 'hand',
      sample: false,
    }
    await db.hingaChecks.put(check)
    expect(await db.hingaChecks.listBy('byResident', 'res-001')).toEqual([check])
  })

  it("won't read or write sealed records while locked", async () => {
    const db = await openAgapayDb('enc-locked', { encryption: true })
    await unlockWith(db)
    await db.residents.put(resident)
    session.clear()
    await expect(db.residents.get('res-001')).rejects.toBeInstanceOf(LockedError)
    await expect(db.residents.put(resident)).rejects.toBeInstanceOf(LockedError)
    // Stores with nothing personal (stock) work as before.
    expect(await db.stockLots.list()).toEqual([])
  })

  it('a wrong key cannot open a sealed record', async () => {
    const db = await openAgapayDb('enc-wrong', { encryption: true })
    await unlockWith(db)
    await db.residents.put(resident)
    session.set((await createLock('1357', { iterations: FAST })).key, 'another-lock')
    await expect(db.residents.get('res-001')).rejects.toThrow()
  })

  it("refuses to write with a stale key after another tab set a new PIN, and drops it", async () => {
    const name = 'enc-stale'
    const tabA = await openAgapayDb(name, { encryption: true })
    await unlockWith(tabA)
    const tabB = await openAgapayDb(name, { encryption: true })
    const { lock: newer } = await createLock('1357', { iterations: FAST })
    await tabB.putLock(newer)
    await expect(tabA.residents.put(resident)).rejects.toBeInstanceOf(LockedError)
    expect(session.key()).toBeNull()
  })

  it('seals records written before the PIN was set', async () => {
    const plain = await openAgapayDb('enc-migrate')
    await plain.residents.put(resident)
    plain.close()
    const db = await openAgapayDb('enc-migrate', { encryption: true })
    await unlockWith(db)
    expect(await db.sealExisting()).toBe(1)
    expect(await rawRecord('enc-migrate', 'residents', 'res-001')).toHaveProperty('sealed')
    expect(await db.residents.get('res-001')).toEqual(resident)
  })

  it('with encryption off and no lock, records are written plain, as before phase 2', async () => {
    const db = await openAgapayDb('enc-off')
    expect(db.encryption).toBe(false)
    await db.residents.put(resident)
    expect(await rawRecord('enc-off', 'residents', 'res-001')).toEqual(resident)
  })

  it('a stored lock keeps sealing on in a build with phase 2 off', async () => {
    const name = 'enc-flag-off'
    const phase2 = await openAgapayDb(name, { encryption: true })
    await unlockWith(phase2)
    phase2.close()
    const flagOff = await openAgapayDb(name)
    expect(flagOff.encryption).toBe(true)
    await flagOff.residents.put(resident)
    expect(await rawRecord(name, 'residents', 'res-001')).toHaveProperty('sealed')
  })

  it('seals the sample data with the demo PIN, saving the lock with it, and leaves the app locked', async () => {
    const db = await openAgapayDb('enc-sample', { encryption: true })
    expect(await loadSampleSeed(db, generateSeed(new Date('2026-10-09T08:00:00+08:00')), { iterations: FAST })).toBe(true)
    expect(session.key()).toBeNull()
    const lock = await db.getLock()
    expect(lock?.demoPin).toBe(DEMO_PIN)
    const key = await keyForPin(lock!, DEMO_PIN)
    expect(key).not.toBeNull()
    session.set(key!, lockIdOf(lock!))
    const residents = await db.residents.list()
    expect(residents.length).toBeGreaterThan(0)
    expect(residents[0].name).toMatch(/^Residente /)
  })

  it('stops showing the demo PIN once a real (non-sample) record is written', async () => {
    const db = await openAgapayDb('enc-demo-hint', { encryption: true })
    await loadSampleSeed(db, generateSeed(new Date('2026-10-09T08:00:00+08:00')), { iterations: FAST, stayUnlocked: true })
    await db.residents.put({ ...resident, sample: true })
    expect((await db.getLock())?.demoPin).toBe(DEMO_PIN)
    await db.residents.put(resident)
    expect((await db.getLock())?.demoPin).toBeNull()
  })

  it('a new PIN seals every record again, in one go with the new lock', async () => {
    const name = 'enc-rekey'
    const db = await openAgapayDb(name, { encryption: true })
    const { key: oldKey } = await unlockWith(db, DEMO_PIN)
    await db.residents.put(resident)
    const { lock, key } = await createLock('482913', { iterations: FAST })
    await db.rekey(lock, key)
    expect(session.lockId()).toBe(lockIdOf(lock))
    expect(await db.residents.get('res-001')).toEqual(resident)
    const stored = await rawRecord(name, 'residents', 'res-001')
    await expect(openValue(oldKey, stored.sealed)).rejects.toThrow()
    expect(await keyForPin((await db.getLock())!, '482913')).not.toBeNull()
  })

  it('counts each wrong try in one transaction', async () => {
    const db = await openAgapayDb('enc-attempts', { encryption: true })
    expect(await Promise.all([db.bumpLockAttempts(), db.bumpLockAttempts()])).toEqual(expect.arrayContaining([1, 2]))
    expect(await db.getLockAttempts()).toEqual({ failures: 2 })
    await db.resetLockAttempts()
    expect(await db.getLockAttempts()).toEqual({ failures: 0 })
  })
})
