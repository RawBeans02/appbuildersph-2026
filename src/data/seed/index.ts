import type { SeedData } from '../db/types'
import { generateSeed } from './generate'

// The phone's synthetic seed (Maligaya-D, San Isidro Demo). src/data/db/appDb.ts
// loads it once, on first run, and marks every record as sample data. Its dates
// count from the moment this module is first evaluated, so the demo story (a
// flood 6 days ago, doxycycline expiring in 6 weeks) is current whenever it loads.
export const seed: SeedData = generateSeed(new Date())
