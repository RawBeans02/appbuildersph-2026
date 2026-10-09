import type { AgapayDb } from '../../data/db/db'
import { loadSampleSeed } from '../../data/db/sampleSeed'
import type { SeedData } from '../../data/db/types'

// "Reset sample data" for rehearsals and Demo Day: every record goes back to
// the synthetic seed, dated from today, and the laptop's sample barangays are
// loaded again. Downloaded models and the service worker are kept, so nothing
// is re-downloaded on venue Wi-Fi (clearing site data would delete them).

export type ResetOptions = {
  // Also forget this phone's signing key and every paired phone.
  resetPairing: boolean
  // The synthetic seed for today.
  makeSeed: () => SeedData | Promise<SeedData>
  // Pairs and receives the municipal sample barangays again.
  loadMunicipalSample: (db: AgapayDb) => Promise<unknown>
  // Phase 2: keep the page unlocked with the new demo-PIN key (a reset from
  // /device), or start locked ("Forgot the PIN?").
  stayUnlocked?: boolean
  // PBKDF2 iterations for the demo PIN (tests use fewer).
  iterations?: number
}

export async function resetSampleData(db: AgapayDb, options: ResetOptions): Promise<void> {
  // With encryption on, the lock goes too: the sample records are sealed again
  // with the demo PIN under a fresh salt.
  await db.clearForReset({ resetPairing: options.resetPairing, resetLock: db.encryption })
  await loadSampleSeed(db, await options.makeSeed(), {
    stayUnlocked: options.stayUnlocked ?? true,
    iterations: options.iterations,
  })
  await options.loadMunicipalSample(db)
}
