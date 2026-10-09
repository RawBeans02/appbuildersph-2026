import type { AgapayDb } from './db'
import { useDbQuery } from './useDbQuery'

// The place names for screen headers: the seed's barangay and municipality,
// and whether sample data is loaded (the header then says "· Sample data").

export type Place = { municipality: string | null; barangay: string | null; sample: boolean }

const readPlace = async (db: AgapayDb): Promise<Place> => {
  const seed = await db.getSeedInfo()
  return { municipality: seed?.municipality ?? null, barangay: seed?.barangay ?? null, sample: seed !== null }
}

export function usePlace(): Place {
  const place = useDbQuery(['residents'], readPlace)
  return place.status === 'ready' ? place.data : { municipality: null, barangay: null, sample: false }
}

// "San Isidro Demo · Sample data", or one of the screens' variants: the parts
// given, then "Sample data" when seeded records are loaded.
export function placeLine(parts: (string | null | undefined)[], sample: boolean): string {
  return [...parts.filter((part): part is string => !!part), ...(sample ? ['Sample data'] : [])].join(' · ')
}
