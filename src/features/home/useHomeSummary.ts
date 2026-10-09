import { useState } from 'react'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery, type DbQueryState } from '../../data/db/useDbQuery'
import { isModelCached } from '../../lib/modelCache'
import { offlineModels } from '../../lib/offlineModels'
import { localToday } from '../../rules/dates'
import { summarizeHome, type HomeSummary } from './summary'

const LIMIT = 1000
const phoneModels = offlineModels.filter((model) => model.device === 'phone')

async function modelsPrepared(): Promise<boolean | null> {
  try {
    return (await Promise.all(phoneModels.map((model) => isModelCached(model)))).every(Boolean)
  } catch {
    // No Cache API: unknown.
    return null
  }
}

const readHome = async (db: AgapayDb) => {
  const [floodEvents, exposures, hingaChecks, stockLots, flags, prepared] = await Promise.all([
    db.floodEvents.list({ limit: 100 }),
    db.exposures.list({ limit: LIMIT }),
    db.hingaChecks.list({ limit: LIMIT }),
    db.stockLots.list({ limit: 500 }),
    db.flags.list({ limit: 500 }),
    modelsPrepared(),
  ])
  return { records: { floodEvents, exposures, hingaChecks, stockLots, flags }, prepared }
}

// The home screen's numbers, re-read whenever one of their records changes.
export function useHomeSummary(): DbQueryState<HomeSummary> {
  const [today] = useState(localToday)
  const data = useDbQuery(['floodEvents', 'exposures', 'hingaChecks', 'stockLots', 'flags'], readHome)
  if (data.status !== 'ready') return data
  return { status: 'ready', data: summarizeHome(data.data.records, today, data.data.prepared) }
}
