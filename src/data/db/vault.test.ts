import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { generateSeed } from '../seed/generate'
import { openAgapayDb } from './db'
import { loadSampleSeed } from './sampleSeed'
import type { HingaCheck, Resident } from './types'
import {
  createLock,
  DEMO_PIN,
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

describe('encrypted records', () => {
  it("seals a resident's personal fields at rest and reads them back while unlocked", async () => {
    const name = 'enc-residents'
    const db = await openAgapayDb(name, { encryption: true })
    const { key } = await createLock('2468', { iterations: FAST })
    session.set(key)
    await db.residents.put(resident)

    // At rest: the id stays plain (indexes and links work), the rest is sealed.
    const raw = await openDB(name)
    const stored = await raw.get('residents', 'res-001')
    raw.close()
    expect(Object.keys(stored).sort()).toEqual(['id', 'sample', 'sealed'])
    expect(JSON.stringify(stored)).not.toMatch(/Residente|HH-01|Purok|2025-04-02/)

    expect(await db.residents.get('res-001')).toEqual(resident)
    expect(await db.residents.list()).toEqual([resident])
  })

  it('keeps index keys plain, so lookups by resident still work', async () => {
    const db = await openAgapayDb('enc-hinga', { encryption: true })
    session.set((await createLock('2468', { iterations: FAST })).key)
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
    session.set((await createLock('2468', { iterations: FAST })).key)
    await db.residents.put(resident)
    session.clear()
    await expect(db.residents.get('res-001')).rejects.toBeInstanceOf(LockedError)
    await expect(db.residents.put(resident)).rejects.toBeInstanceOf(LockedError)
    // Stores with nothing personal (stock) work as before.
    expect(await db.stockLots.list()).toEqual([])
  })

  it('a wrong key cannot open a sealed record', async () => {
    const db = await openAgapayDb('enc-wrong', { encryption: true })
    session.set((await createLock('2468', { iterations: FAST })).key)
    await db.residents.put(resident)
    session.set((await createLock('1357', { iterations: FAST })).key)
    await expect(db.residents.get('res-001')).rejects.toThrow()
  })

  it('seals records written before the PIN was set', async () => {
    const plain = await openAgapayDb('enc-migrate')
    await plain.residents.put(resident)
    plain.close()
    const db = await openAgapayDb('enc-migrate', { encryption: true })
    session.set((await createLock('2468', { iterations: FAST })).key)
    expect(await db.sealExisting()).toBe(1)
    const raw = await openDB('enc-migrate')
    expect(await raw.get('residents', 'res-001')).toHaveProperty('sealed')
    raw.close()
    expect(await db.residents.get('res-001')).toEqual(resident)
  })

  it('with encryption off, records are written plain, as before phase 2', async () => {
    const db = await openAgapayDb('enc-off')
    await db.residents.put(resident)
    const raw = await openDB('enc-off')
    expect(await raw.get('residents', 'res-001')).toEqual(resident)
    raw.close()
  })

  it('seals the sample data with the demo PIN and leaves the app locked', async () => {
    const db = await openAgapayDb('enc-sample', { encryption: true })
    expect(await loadSampleSeed(db, generateSeed(new Date('2026-10-09T08:00:00+08:00')), { iterations: FAST })).toBe(true)
    expect(session.key()).toBeNull()
    const lock = await db.getLock()
    expect(lock?.demoPin).toBe(DEMO_PIN)
    const key = await keyForPin(lock!, DEMO_PIN)
    expect(key).not.toBeNull()
    session.set(key!)
    const residents = await db.residents.list()
    expect(residents.length).toBeGreaterThan(0)
    expect(residents[0].name).toMatch(/^Residente /)
  })
})
