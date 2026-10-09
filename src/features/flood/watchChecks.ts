import type { AgapayDb } from '../../data/db/db'
import type { WatchCheck, WatchCheckResult } from '../../data/db/types'
import { localToday } from '../../rules/dates'

// Checks on people in the watch window (9b): "Checked today: no signs" or
// "Referred to the RHU". The watch-list row shows the latest one.

export async function recordWatchCheck(
  db: AgapayDb,
  residentId: string,
  result: WatchCheckResult,
  now = new Date(),
): Promise<WatchCheck> {
  const check: WatchCheck = { id: crypto.randomUUID(), residentId, checkedAt: now.toISOString(), result, sample: false }
  await db.watchChecks.put(check)
  return check
}

// The checks on these residents, newest first (bounded per resident).
export async function readWatchChecks(db: AgapayDb, residentIds: string[]): Promise<WatchCheck[]> {
  const lists = await Promise.all(residentIds.map((id) => db.watchChecks.listBy('byResident', id, { limit: 100 })))
  return lists.flat().sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
}

export type RowStatus = { kind: 'checked' | 'referred'; at: Date } | null

// The row's status: the latest check since this person's first contact. A
// referral stays shown; "Checked" only on the day it was done.
export function rowStatus(checks: WatchCheck[], residentId: string, firstExposedOn: string, today: string): RowStatus {
  const latest = checks
    .filter((check) => check.residentId === residentId && localToday(new Date(check.checkedAt)) >= firstExposedOn)
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0]
  if (!latest) return null
  const at = new Date(latest.checkedAt)
  if (latest.result === 'referred') return { kind: 'referred', at }
  return localToday(at) === today ? { kind: 'checked', at } : null
}
