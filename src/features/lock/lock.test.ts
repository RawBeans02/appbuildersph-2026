import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'
import { openAgapayDb, type AgapayDb } from '../../data/db/db'
import { loadSampleSeed } from '../../data/db/sampleSeed'
import type { Resident } from '../../data/db/types'
import { DEMO_PIN, session } from '../../data/db/vault'
import { generateSeed } from '../../data/seed/generate'
import { createLockController } from './lock'

const FAST = 1_000
const SEED = () => generateSeed(new Date('2026-10-09T08:00:00+08:00'))
const resident: Resident = {
  id: 'res-real',
  name: 'Residente 900',
  householdId: 'HH-90',
  purok: 'Purok 9',
  sex: 'M',
  birthDate: '2024-01-01',
  sample: false,
}

async function setup(name: string, { sample = true, phase2 = true, getDb }: { sample?: boolean; phase2?: boolean; getDb?: () => Promise<AgapayDb> } = {}) {
  const db = await openAgapayDb(name, { encryption: phase2 })
  if (sample) await loadSampleSeed(db, SEED(), { iterations: FAST })
  let clock = 1_000
  const controller = (start = clock) => {
    clock = start
    return createLockController({
      phase2,
      getDb: getDb ?? (async () => db),
      forgetRecords: async (database: AgapayDb) => {
        await database.clearForReset({ resetPairing: false, resetLock: true })
        await loadSampleSeed(database, SEED(), { iterations: FAST })
      },
      now: () => clock,
      iterations: FAST,
    })
  }
  const lock = controller()
  await lock.init()
  return { db, lock, controller, tick: (ms: number) => (clock += ms) }
}

afterEach(() => session.clear())

describe('the PIN lock', () => {
  it('is off, and touches nothing it does not need, when phase 2 is off and no lock is stored', async () => {
    const { lock } = await setup('lock-off', { sample: false, phase2: false })
    expect(lock.getView()).toEqual({ status: 'off' })
  })

  it('a stored lock still locks a build with phase 2 off (records sealed by a phase-2 build)', async () => {
    const name = 'lock-flag-off'
    const phase2 = await openAgapayDb(name, { encryption: true })
    await loadSampleSeed(phase2, SEED(), { iterations: FAST })
    phase2.close()
    const { lock } = await setup(name, { sample: false, phase2: false })
    expect(lock.getView()).toMatchObject({ status: 'locked', demoPin: DEMO_PIN })
  })

  it('starts locked on sample data, showing the demo PIN, and opens with it', async () => {
    const { db, lock } = await setup('lock-demo')
    expect(lock.getView()).toMatchObject({ status: 'locked', demoPin: DEMO_PIN, wrong: false, waitUntil: 0 })
    expect(await lock.unlock(DEMO_PIN)).toBe('ok')
    expect(lock.getView()).toEqual({ status: 'unlocked', usingDemoPin: true })
    expect((await db.residents.list()).length).toBeGreaterThan(0)
  })

  it('waits longer after each wrong PIN from the third, on the page clock, and again after a reload', async () => {
    const { db, lock, controller, tick } = await setup('lock-wrong')
    expect(await lock.unlock('0000')).toBe('wrong')
    expect(await lock.unlock('0000')).toBe('wrong')
    expect(lock.getView()).toMatchObject({ status: 'locked', wrong: true, waitUntil: 0 })
    expect(await lock.unlock('0000')).toBe('wrong')
    expect(lock.getView()).toMatchObject({ waitUntil: 1_000 + 5_000 })
    // Now a 5 s wait: even the right PIN waits.
    expect(await lock.unlock(DEMO_PIN)).toBe('wait')
    expect(await db.getLockAttempts()).toEqual({ failures: 3 })

    // A reload doesn't skip it: the wait runs again from the new page's start.
    const reloaded = controller(50_000)
    await reloaded.init()
    expect(reloaded.getView()).toMatchObject({ status: 'locked', waitUntil: 55_000 })
    expect(await reloaded.unlock(DEMO_PIN)).toBe('wait')
    tick(5_000)
    expect(await reloaded.unlock(DEMO_PIN)).toBe('ok')
    expect(await db.getLockAttempts()).toEqual({ failures: 0 })
  })

  it('counts tries made at the same moment one by one', async () => {
    const { db, lock } = await setup('lock-concurrent')
    const results = await Promise.all([lock.unlock('1111'), lock.unlock('2222')])
    expect(results).toEqual(['wrong', 'wrong'])
    expect(await db.getLockAttempts()).toEqual({ failures: 2 })
  })

  it('asks for a PIN on a phone with no sample data; the lock is saved, then what is there is sealed', async () => {
    const name = 'lock-setup'
    // A record from before phase 2 (written plain).
    const before = await openAgapayDb(name)
    await before.residents.put(resident)
    before.close()
    const { db, lock } = await setup(name, { sample: false })
    expect(lock.getView()).toEqual({ status: 'setup', busy: false })
    await lock.setPin('482913')
    expect(lock.getView()).toEqual({ status: 'unlocked', usingDemoPin: false })
    expect((await db.getLock())?.demoPin).toBeNull()
    const raw = await openDB(name)
    expect(await raw.get('residents', 'res-real')).toHaveProperty('sealed')
    raw.close()
  })

  it('an unlock finishes sealing records an interrupted save left plain', async () => {
    const name = 'lock-leftover'
    const { lock } = await setup(name)
    const raw = await openDB(name)
    await raw.put('residents', resident)
    raw.close()
    expect(await lock.unlock(DEMO_PIN)).toBe('ok')
    const after = await openDB(name)
    expect(await after.get('residents', 'res-real')).toHaveProperty('sealed')
    after.close()
  })

  it('"Set your own PIN" seals everything again with the new PIN', async () => {
    const { db, lock } = await setup('lock-change')
    await lock.unlock(DEMO_PIN)
    await lock.changePin('482913')
    expect(lock.getView()).toEqual({ status: 'unlocked', usingDemoPin: false })
    await lock.lockNow()
    expect(lock.getView()).toMatchObject({ status: 'locked', demoPin: null })
    expect(await lock.unlock(DEMO_PIN)).toBe('wrong')
    expect(await lock.unlock('482913')).toBe('ok')
    expect((await db.residents.list()).length).toBeGreaterThan(0)
  })

  it('"Lock now" drops the key', async () => {
    const { lock } = await setup('lock-now')
    await lock.unlock(DEMO_PIN)
    await lock.lockNow()
    expect(lock.getView()).toMatchObject({ status: 'locked' })
    expect(session.key()).toBeNull()
  })

  it('"Forgot the PIN?" erases the records and brings the sample data back, locked with the demo PIN', async () => {
    const { db, lock } = await setup('lock-forget')
    await lock.unlock('0000')
    await lock.forget()
    expect(lock.getView()).toMatchObject({ status: 'locked', demoPin: DEMO_PIN, wrong: false })
    expect(await db.getLockAttempts()).toEqual({ failures: 0 })
    expect(await lock.unlock(DEMO_PIN)).toBe('ok')
  })

  it('shows an error to retry when the records can’t be opened', async () => {
    let fail = true
    const { lock } = await setup('lock-error', {
      sample: false,
      getDb: async () => {
        if (fail) throw new Error('IndexedDB is unavailable')
        return openAgapayDb('lock-error', { encryption: true })
      },
    })
    expect(lock.getView()).toEqual({ status: 'error', message: 'IndexedDB is unavailable' })
    fail = false
    await lock.init()
    expect(lock.getView()).toEqual({ status: 'setup', busy: false })
  })
})
