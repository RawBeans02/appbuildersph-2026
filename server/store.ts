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

export type AlertKind = 'doctor-team' | 'move-stock' | 'watch'
// 'superseded': a draft left undecided when a newer draft batch of its
// municipality was made; it can't be approved or rejected any more.
export type AlertStatus = 'draft' | 'approved' | 'rejected' | 'superseded'

// An alert as drafted (server/luna/): the facts it's built from, the template
// made from them, the wording offered (GPT-6 Luna's when it passed the check,
// else the template) and, once a person decides, the decision.
export type NewAlert = {
  municipality: string
  barangay: string
  // The barangays whose phones read it once approved.
  audience: string[]
  epiWeek: string
  kind: AlertKind
  text: string
  templateText: string
  facts: unknown
  // 'edited': an officer changed the wording when approving it.
  source: 'luna' | 'template' | 'edited'
  checkReasons: string[]
  // Why the template is shown: the AI was off, failed or didn't pass the check.
  aiNote: string | null
  draftedBy: string
  batch: string
  createdAt: Date
}

export type AlertRecord = NewAlert & {
  id: string
  status: AlertStatus
  // A role, never a person's name.
  approvedByRole: string | null
  approvedAt: Date | null
  decidedByRole: string | null
  decidedAt: Date | null
}

// `source`: 'edited' when the approving officer changed the wording.
export type AlertDecision = { status: 'approved' | 'rejected'; role: string; at: Date; text: string; source?: 'edited' }

export interface Store {
  // Adds one hit to `key`'s window starting at `windowStart` and returns the
  // window's count. Drops windows that started before `purgeBefore`.
  hitRateLimit(key: string, windowStart: Date, purgeBefore: Date): Promise<number>
  // The window's count for `key` so far, without adding a hit.
  rateLimitCount(key: string, windowStart: Date): Promise<number>
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
  // The newest week's report for each barangay of the municipality, among
  // the reports signed by the barangay's currently vouched phone key (a
  // replaced phone's reports are no longer served).
  latestReports(municipality: string, limit: number): Promise<ReportRecord[]>

  audit(entry: AuditEntry): Promise<void>
  // The newest audit rows of these actions for one municipality.
  auditTrail(municipality: string, actions: readonly string[], limit: number): Promise<AuditEntry[]>

  // Phase 2 alerts. One call to the model from the day's limit: false once
  // `limit` calls were taken on `day` (YYYY-MM-DD).
  takeLunaCall(day: string, limit: number): Promise<boolean>
  // Gives a taken call back (OpenAI answered with an error, which isn't
  // billed); never below 0.
  refundLunaCall(day: string): Promise<void>
  lunaCalls(day: string): Promise<number>
  insertAlerts(alerts: NewAlert[]): Promise<AlertRecord[]>
  // Marks every undecided draft of the municipality superseded (before a new
  // batch is inserted, in the same transaction); returns how many.
  supersedeDrafts(municipality: string): Promise<number>
  getAlert(id: string): Promise<AlertRecord | null>
  // Decides a draft; null when it isn't a draft any more.
  decideAlert(id: string, decision: AlertDecision): Promise<AlertRecord | null>
  listAlerts(municipality: string, statuses: readonly AlertStatus[], limit: number): Promise<AlertRecord[]>
  // Approved alerts of a municipality, or only those for these barangays.
  approvedAlerts(municipality: string, barangays: readonly string[] | null, limit: number): Promise<AlertRecord[]>
  // The barangays a phone key is vouched for (normally one).
  phoneKeys(fingerprint: string): Promise<BarangayKeyRecord[]>

  // Runs `work` in one database transaction (all or nothing).
  transaction<T>(work: (store: Store) => Promise<T>): Promise<T>
  // True when the database answers.
  ping(): Promise<boolean>
}
