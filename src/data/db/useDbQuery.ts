import { useEffect, useState } from 'react'
import { getDb } from './appDb'
import type { AgapayDb, RecordStore } from './db'

export type DbQueryState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: unknown }

// Runs a query against the app database, and again whenever a record in one
// of `stores` is written. Pass a stable `query` (module-level or useCallback),
// or it re-runs on every render.
export function useDbQuery<T>(
  stores: readonly RecordStore[],
  query: (db: AgapayDb) => Promise<T>,
): DbQueryState<T> {
  const [state, setState] = useState<DbQueryState<T>>({ status: 'loading' })
  const storesKey = stores.join(',')

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}
    const run = (db: AgapayDb) =>
      query(db).then(
        (data) => !cancelled && setState({ status: 'ready', data }),
        (error: unknown) => !cancelled && setState({ status: 'error', error }),
      )
    getDb().then(
      (db) => {
        if (cancelled) return
        const watched = storesKey ? (storesKey.split(',') as RecordStore[]) : []
        unsubscribe = db.subscribe(watched, () => void run(db))
        void run(db)
      },
      (error: unknown) => !cancelled && setState({ status: 'error', error }),
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [storesKey, query])

  return state
}
