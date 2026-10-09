import type { AgapayDb } from './db'
import type { SeedData } from './types'
import { createLock, DEMO_PIN, lockIdOf, PBKDF2_ITERATIONS, session } from './vault'

// Loads the synthetic seed. With encryption on (phase 2), the sample records
// are sealed with the demo PIN under a fresh salt, and the lock is saved in
// the same transaction as them; stayUnlocked keeps that key in this page (a
// reset while unlocked), else the app starts locked (first run, "Forgot the
// PIN?").
export async function loadSampleSeed(
  db: AgapayDb,
  seed: SeedData,
  { stayUnlocked = false, iterations = PBKDF2_ITERATIONS }: { stayUnlocked?: boolean; iterations?: number } = {},
): Promise<boolean> {
  if (!db.encryption) return db.loadSeed(seed)
  const { lock, key } = await createLock(DEMO_PIN, { demoPin: DEMO_PIN, iterations })
  const previous = { key: session.key(), lockId: session.lockId() }
  session.set(key, lockIdOf(lock))
  let wrote = false
  try {
    wrote = await db.loadSeed(seed, new Date(), lock)
  } finally {
    if (!wrote) {
      if (previous.key && previous.lockId) session.set(previous.key, previous.lockId)
      else session.clear()
    } else if (!stayUnlocked) session.clear()
  }
  return wrote
}
