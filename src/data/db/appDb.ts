import { PHASE2 } from '../../lib/phase2'
import { openAgapayDb, type AgapayDb } from './db'
import { loadSampleSeed } from './sampleSeed'
import type { SeedData } from './types'

// The app's one database. On first run it loads the synthetic seed from
// src/data/seed/index.ts (`export const seed: SeedData`), found with
// import.meta.glob so the app builds before that file exists. The seed is its
// own chunk and is only fetched while the database has no seed yet.

const seedModules = import.meta.glob<{ seed: SeedData }>('../seed/index.ts')

async function importSeed(): Promise<SeedData | null> {
  const load = Object.values(seedModules)[0]
  return load ? (await load()).seed : null
}

// Whether this build carries the sample seed (the demo build does).
export const hasSampleSeed = () => Object.keys(seedModules).length > 0

// encryption: phase 2's sealed fields (src/data/db/vault.ts); sample data is
// then sealed with the demo PIN and the app starts locked.
export async function openAppDb(
  name?: string,
  loadSeedData: () => Promise<SeedData | null> = importSeed,
  { encryption = PHASE2 }: { encryption?: boolean } = {},
): Promise<AgapayDb> {
  const db = await openAgapayDb(name, { encryption })
  if (!(await db.getSeedInfo())) {
    const seed = await loadSeedData()
    if (seed) await loadSampleSeed(db, seed)
  }
  return db
}

let appDb: Promise<AgapayDb> | null = null

export function getDb(): Promise<AgapayDb> {
  appDb ??= openAppDb()
  return appDb
}
