import type { AgapayDb } from './db'
import type { SeedData } from './types'
import { createLock, DEMO_PIN, PBKDF2_ITERATIONS, session } from './vault'

// Loads the synthetic seed. With encryption on (phase 2), the sample records
// are sealed with the demo PIN under a fresh salt, and the lock is saved with
// them; stayUnlocked keeps that key in this page (a reset while unlocked),
// else the app starts locked (first run, "Forgot the PIN?").
export async function loadSampleSeed(
  db: AgapayDb,
  seed: SeedData,
  { stayUnlocked = false, iterations = PBKDF2_ITERATIONS }: { stayUnlocked?: boolean; iterations?: number } = {},
): Promise<boolean> {
  if (!db.encryption) return db.loadSeed(seed)
  const { lock, key } = await createLock(DEMO_PIN, { demoPin: DEMO_PIN, iterations })
  const previous = session.key()
  session.set(key)
  let wrote = false
  try {
    wrote = await db.loadSeed(seed)
    if (wrote) {
      await db.putLock(lock)
      await db.putLockAttempts({ failures: 0, waitUntil: 0 })
    }
  } finally {
    if (!wrote) {
      if (previous) session.set(previous)
      else session.clear()
    } else if (!stayUnlocked) session.clear()
  }
  return wrote
}
