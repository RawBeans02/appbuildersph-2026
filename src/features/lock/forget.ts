import { hasSampleSeed } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { generateSeed } from '../../data/seed/generate'
import { resetSampleData } from '../device/resetSampleData'
import { loadMunicipalSample } from '../municipal/municipal'

// "Forgot the PIN?": the sealed records can't be opened without the PIN, so
// they're erased. The demo build loads the sample data again, sealed with the
// demo PIN, and stays locked; a build without sample data is left empty and
// asks for a new PIN. This phone's signing key, its pairing and the
// downloaded models stay.
export async function forgetRecords(db: AgapayDb): Promise<void> {
  if (hasSampleSeed()) {
    await resetSampleData(db, {
      resetPairing: false,
      makeSeed: () => generateSeed(new Date()),
      loadMunicipalSample: (database) => loadMunicipalSample(database),
      stayUnlocked: false,
    })
  } else {
    await db.clearForReset({ resetPairing: false, resetLock: true })
  }
}
