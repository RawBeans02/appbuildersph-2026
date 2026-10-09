import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { openAgapayDb, type AgapayDb } from '../../data/db/db'
import { loadSampleSeed } from '../../data/db/sampleSeed'
import { DEMO_PIN, session } from '../../data/db/vault'
import { generateSeed } from '../../data/seed/generate'
import { createLockController } from './lock'

const FAST = 1_000
const SEED = () => generateSeed(new Date('2026-10-09T08:00:00+08:00'))

async function setup(name: string, { sample = true } = {}) {
  const db = await openAgapayDb(name, { encryption: true })
  if (sample) await loadSampleSeed(db, SEED(), { iterations: FAST })
  let clock = 1_000_000
  const lock = createLockController({
    phase2: true,
    getDb: async () => db,
    forgetRecords: async (database: AgapayDb) => {
      await database.clearForReset({ resetPairing: false, resetLock: true })
      await loadSampleSeed(database, SEED(), { iterations: FAST })
    },
    now: () => clock,
    iterations: FAST,
  })
  await lock.init()
  return { db, lock, tick: (ms: number) => (clock += ms) }
}

afterEach(() => session.clear())

describe('the PIN lock', () => {
  it('is off, and touches nothing, when phase 2 is off', async () => {
    const lock = createLockController({
      phase2: false,
      getDb: () => Promise.reject(new Error('never opened')),
      forgetRecords: async () => {},
    })
    await lock.init()
    expect(lock.getView()).toEqual({ status: 'off' })
  })

  it('starts locked on sample data, showing the demo PIN, and opens with it', async () => {
    const { db, lock } = await setup('lock-demo')
    expect(lock.getView()).toMatchObject({ status: 'locked', demoPin: DEMO_PIN, wrong: false })
    expect(await lock.unlock(DEMO_PIN)).toBe('ok')
    expect(lock.getView()).toEqual({ status: 'unlocked' })
    expect((await db.residents.list()).length).toBeGreaterThan(0)
  })

  it('makes each wrong PIN after the second wait longer, and the wait survives a reload', async () => {
    const { db, lock, tick } = await setup('lock-wrong')
    expect(await lock.unlock('0000')).toBe('wrong')
    expect(await lock.unlock('0000')).toBe('wrong')
    expect(lock.getView()).toMatchObject({ status: 'locked', wrong: true })
    expect(await lock.unlock('0000')).toBe('wrong')
    // Now a 5 s wait: even the right PIN waits.
    expect(await lock.unlock(DEMO_PIN)).toBe('wait')
    expect(await db.getLockAttempts()).toMatchObject({ failures: 3 })

    const reloaded = createLockController({
      phase2: true,
      getDb: async () => db,
      forgetRecords: async () => {},
      now: () => 1_000_000 + 1_000,
      iterations: FAST,
    })
    await reloaded.init()
    expect(await reloaded.unlock(DEMO_PIN)).toBe('wait')

    tick(5_000)
    expect(await lock.unlock(DEMO_PIN)).toBe('ok')
    expect(await db.getLockAttempts()).toEqual({ failures: 0, waitUntil: 0 })
  })

  it('asks for a PIN on a phone with no sample data, and seals what is already there with it', async () => {
    const { db, lock } = await setup('lock-setup', { sample: false })
    expect(lock.getView()).toEqual({ status: 'setup', busy: false })
    await lock.setPin('482913')
    expect(lock.getView()).toEqual({ status: 'unlocked' })
    expect((await db.getLock())?.demoPin).toBeNull()
  })

  it('"Forgot the PIN?" erases the records and brings the sample data back, locked with the demo PIN', async () => {
    const { db, lock } = await setup('lock-forget')
    await lock.unlock('0000')
    await lock.forget()
    expect(lock.getView()).toMatchObject({ status: 'locked', demoPin: DEMO_PIN, wrong: false })
    expect(await db.getLockAttempts()).toEqual({ failures: 0, waitUntil: 0 })
    expect(await lock.unlock(DEMO_PIN)).toBe('ok')
  })
})
