import { openAgapayDb, type AgapayDb } from './db'
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

export async function openAppDb(
  name?: string,
  loadSeedData: () => Promise<SeedData | null> = importSeed,
): Promise<AgapayDb> {
  const db = await openAgapayDb(name)
  if (!(await db.getSeedInfo())) {
    const seed = await loadSeedData()
    if (seed) await db.loadSeed(seed)
  }
  return db
}

let appDb: Promise<AgapayDb> | null = null

export function getDb(): Promise<AgapayDb> {
  appDb ??= openAppDb()
  return appDb
}
