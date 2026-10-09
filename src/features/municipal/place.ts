import type { AgapayDb } from '../../data/db/db'
import { useDbQuery } from '../../data/db/useDbQuery'
import { DEMO_MUNICIPALITY } from '../../data/places'
import { hasSampleData } from './slots'

const readSample = async (db: AgapayDb) => hasSampleData(await db.pairedDevices.list({ limit: 500 }))

// "San Isidro Demo · Sample data", or without "· Sample data" when no seeded
// barangay is on this laptop.
export function useLaptopPlace(): { place: string; sample: boolean } {
  const sample = useDbQuery(['pairedDevices'], readSample)
  const isSample = sample.status === 'ready' && sample.data
  return { place: isSample ? `${DEMO_MUNICIPALITY.name} · Sample data` : DEMO_MUNICIPALITY.name, sample: !!isSample }
}
