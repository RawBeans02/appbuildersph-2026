import type { AgapayDb } from '../../data/db/db'
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
}

export async function resetSampleData(db: AgapayDb, options: ResetOptions): Promise<void> {
  await db.clearForReset({ resetPairing: options.resetPairing })
  await db.loadSeed(await options.makeSeed())
  await options.loadMunicipalSample(db)
}
