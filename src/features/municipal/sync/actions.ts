import type { AgapayDb } from '../../../data/db/db'
import { ensureMunicipalSample, LAPTOP_MUNICIPALITY, readHandoff } from '../municipal'
import { enrollLaptop, uploadSync, type Fetcher, type SyncProblem } from './client'
import { buildSyncData, syncRows } from './results'
import type { Enrollment, LastSync, SyncStore } from './syncStore'

// The two things the officer does on the Sync screen. Neither changes the
// laptop's records: a sync only reads the paired keys and received QRs.

export type Outcome<T> = { ok: true; value: T } | { ok: false; problem: SyncProblem }

// "Register this laptop": makes the laptop's key on first use, then enrolls it.
export async function registerLaptop(store: SyncStore, code: string, fetcher?: Fetcher, now = new Date()): Promise<Outcome<Enrollment>> {
  const identity = await store.ensureIdentity(now)
  const result = await enrollLaptop(identity, code, LAPTOP_MUNICIPALITY, fetcher)
  if (!result.ok) return result
  const enrollment = { fingerprint: result.value.fingerprint, municipality: result.value.municipality, enrolledAt: now.toISOString() }
  await store.putEnrollment(enrollment)
  return { ok: true, value: { id: 'enrollment', ...enrollment } }
}

// "Sync now": uploads the paired phones' keys and the received QRs, and keeps
// the server's per-barangay answers as the last sync.
export async function syncNow(db: AgapayDb, store: SyncStore, fetcher?: Fetcher, now = new Date()): Promise<Outcome<LastSync>> {
  const identity = await store.getIdentity()
  if (!identity) return { ok: false, problem: { kind: 'not-registered' } }
  await ensureMunicipalSample(db)
  const { data, sent } = buildSyncData(await readHandoff(db))
  const result = await uploadSync(identity, data, fetcher, now)
  if (!result.ok) {
    // The server no longer knows this key: show the register step again.
    if (result.problem.kind === 'not-registered') await store.clearEnrollment()
    return result
  }
  const last: LastSync = { id: 'lastSync', at: result.value.syncedAt, rows: syncRows(sent, result.value) }
  await store.putLastSync({ at: last.at, rows: last.rows })
  return { ok: true, value: last }
}
