import type { PublicJwk } from '../src/qr/index.js'

// What the server keeps, as the handlers see it. The Postgres implementation
// is in db.ts; unit tests use an in-memory one (server/test/memoryStore.ts).
//
// Nothing here holds a person: devices and keys are identified by their key
// fingerprints, places by their demo codes, weeks by ISO week, and reports
// carry only the suppressed counts of a verified QR (src/qr/schema.ts).

export type DeviceRecord = {
  // keyFingerprint(publicJwk), e.g. "3F2A-91C0-7B1E-04D2".
  fingerprint: string
  role: 'municipal'
  municipality: string
  publicJwk: PublicJwk
  enrolledAt: Date
}

// A barangay phone's public key, vouched for by an enrolled laptop that paired
// it (the officer compared fingerprints on both screens).
export type BarangayKeyRecord = {
  barangay: string
  municipality: string
  publicJwk: PublicJwk
  fingerprint: string
  vouchedBy: string
  updatedAt: Date
}

export type ReportRecord = {
  barangay: string
  epiWeek: string
  seq: number
  municipality: string
  // The verified QR payload (QrPayloadV1): codes, the week, seq and counts.
  payload: unknown
  phoneFingerprint: string
  receivedFrom: string
  receivedAt: Date
}

export type AuditEntry = {
  at: Date
  // A key fingerprint or a role ("doh-view"), never a person.
  actor: string
  action: string
  // Counts and codes only.
  detail: Record<string, unknown>
}

export type ReportWrite = 'stored' | 'kept-newer' | 'unchanged'

export interface Store {
  // Adds one hit to `key`'s window starting at `windowStart` and returns the
  // window's count. Drops windows that started before `purgeBefore`.
  hitRateLimit(key: string, windowStart: Date, purgeBefore: Date): Promise<number>
  // True the first time `nonce` is seen; false for a replay. Forgets nonces
  // seen before `purgeBefore`.
  claimNonce(nonce: string, now: Date, purgeBefore: Date): Promise<boolean>

  getDevice(fingerprint: string): Promise<DeviceRecord | null>
  // Enrolls a laptop key, or updates the municipality of one already enrolled.
  putDevice(device: DeviceRecord): Promise<void>

  // 'stored' when the barangay's key is new or changed, else 'unchanged'.
  putBarangayKey(key: BarangayKeyRecord): Promise<'stored' | 'unchanged'>
  barangayKeys(municipality: string, limit: number): Promise<BarangayKeyRecord[]>

  // One row per barangay and week. A report replaces the stored one when its
  // seq is higher, or when another phone signed it (the barangay's vouched
  // key changed: a new phone starts again from seq 1).
  putReport(report: ReportRecord): Promise<ReportWrite>
  // The newest week's report for each barangay of the municipality.
  latestReports(municipality: string, limit: number): Promise<ReportRecord[]>

  audit(entry: AuditEntry): Promise<void>

  // Runs `work` in one database transaction (all or nothing).
  transaction<T>(work: (store: Store) => Promise<T>): Promise<T>
  // True when the database answers.
  ping(): Promise<boolean>
}
