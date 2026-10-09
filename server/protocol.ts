// The phase 2 sync protocol between the municipal laptop and the optional
// backend (api/): request shapes, limits and how a laptop signs a request.
// Shared by the server and the laptop (src/features/municipal/sync/), so it
// stays browser-safe: Web Crypto and src/qr only, no Node modules.
//
// Trust chain: the enroll code admits a laptop's own key (POST /api/enroll);
// the laptop signs every later request with that key; it vouches for the
// barangay phones' public keys it paired; each barangay report is a counts QR
// the server verifies again against the vouched key. See docs/ARCHITECTURE.md.

import { signBytes, toBase64url, type CountRange, type Counts, type CountsOf, type PublicJwk, type QrErrorCode } from '../src/qr/index.js'

// base64url ECDSA P-256 / SHA-256 signature (64 bytes raw r||s) over the exact
// request body bytes.
export const SIGNATURE_HEADER = 'x-agapay-signature'
// The DOH view's access code, compared on the server in constant time.
export const VIEW_CODE_HEADER = 'x-agapay-view-code'

// A request's ts may differ from the server's clock by at most this much.
export const MAX_CLOCK_SKEW_MS = 5 * 60_000
// Nonces are remembered at least this long (twice the skew, so a request
// can't be replayed while its ts is still accepted).
export const NONCE_TTL_MS = 10 * 60_000
// Bodies over this are refused with 413 before they are parsed.
export const MAX_BODY_BYTES = 256 * 1024
// Per sync request. A laptop keeps one received QR per barangay, so these are
// far above a municipality's needs; they bound the work one request can cause.
export const MAX_SYNC_KEYS = 100
export const MAX_SYNC_REPORTS = 300
// A counts QR is at most 343 bytes of payload plus the prefix and signature
// (src/qr/README.md); anything longer isn't one.
export const MAX_QR_TEXT = 1024
// The enroll code is compared as a SHA-256 digest; this only bounds the input.
export const MAX_CODE_LENGTH = 256

// "3F2A-91C0-7B1E-04D2", as keyFingerprint() writes it.
export const FINGERPRINT_PATTERN = /^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/
// base64url of 16 to 48 random bytes.
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,64}$/

// POST /api/enroll. The body is signed with the key it enrolls (proof that
// the laptop holds the private key); the signature header is required.
export type EnrollBody = {
  publicJwk: PublicJwk
  municipality: string
  code: string
}

export type EnrollResponse = { ok: true; fingerprint: string; municipality: string }

// Every signed request: the laptop's key fingerprint, its clock in ms since
// the epoch, a fresh random nonce, and the route's data.
export type SignedEnvelope<T> = {
  fingerprint: string
  ts: number
  nonce: string
  data: T
}

// POST /api/sync data: the phones' public keys this laptop paired (it vouches
// for them) and the counts QR texts it received, exactly as scanned.
export type SyncData = {
  barangayKeys: { barangay: string; publicJwk: PublicJwk }[]
  reports: string[]
}

export type KeyResult =
  | { barangay: string; ok: true; status: 'stored' | 'unchanged' }
  | { barangay: string; ok: false; code: 'other-municipality' | 'invalid-key' }

export type ReportResult =
  | {
      index: number
      ok: true
      barangay: string
      epiWeek: string
      seq: number
      // stored: new, or newer than the server's copy. kept-newer: the server
      // already has a higher seq for that barangay and week. unchanged: the
      // same seq from the same phone.
      status: 'stored' | 'kept-newer' | 'unchanged'
    }
  // `message`: why, when the code alone doesn't say (a week outside the
  // accepted window is 'invalid-payload' with the window).
  | { index: number; ok: false; code: QrErrorCode | 'other-municipality'; barangay?: string; message?: string }

export type SyncResponse = {
  ok: true
  syncedAt: string
  barangayKeys: KeyResult[]
  reports: ReportResult[]
}

// GET /api/reports?municipality=SID (view code header): the latest report per
// barangay, as sent (suppressed counts only), plus the newest week's totals.
export type ReportRow = {
  barangay: string
  epiWeek: string
  seq: number
  counts: Counts
  receivedAt: string
  // The laptop key that uploaded it, and the phone key that signed it.
  receivedFrom: string
  phoneFingerprint: string
}

export type ReportsResponse = {
  ok: true
  municipality: string
  rows: ReportRow[]
  // Ranges, exact only when no "<5" went in (src/qr mergePayloads), over the
  // barangays that reported in the newest week. null with no rows.
  totals: { epiWeek: string; barangays: number; counts: CountsOf<CountRange> } | null
}

export type ErrorCode =
  | 'not-configured'
  | 'bad-request'
  | 'too-large'
  | 'rate-limited'
  | 'stale-request'
  | 'unknown-device'
  | 'bad-signature'
  | 'replayed'
  | 'wrong-code'
  | 'not-found'
  | 'already-decided'
  | 'check-failed'
  | 'server-error'

// `reasons`: why an edited alert didn't pass the check (check-failed).
export type ErrorResponse = { ok: false; error: ErrorCode; message: string; reasons?: string[] }

export type HealthResponse = {
  ok: true
  database: { configured: boolean; reachable: boolean }
  enrollConfigured: boolean
  viewConfigured: boolean
}

const encoder = new TextEncoder()

// 16 random bytes, base64url (22 characters).
export function newNonce(): string {
  return toBase64url(crypto.getRandomValues(new Uint8Array(16)))
}

// The body text and its signature header for a request signed by `privateKey`.
// The server verifies the signature over these exact bytes, so send `body`
// unchanged.
export async function signBody(privateKey: CryptoKey, body: string): Promise<{ body: string; signature: string }> {
  const signature = await signBytes(privateKey, encoder.encode(body))
  return { body, signature: toBase64url(signature) }
}

export async function signEnvelope<T>(
  privateKey: CryptoKey,
  fingerprint: string,
  data: T,
  options: { now?: Date; nonce?: string } = {},
): Promise<{ body: string; signature: string }> {
  const envelope: SignedEnvelope<T> = {
    fingerprint,
    ts: (options.now ?? new Date()).getTime(),
    nonce: options.nonce ?? newNonce(),
    data,
  }
  return signBody(privateKey, JSON.stringify(envelope))
}

// --- Phase 2 alerts (server/luna/) -------------------------------------------

// Why the AI wording isn't used: switched off (LUNA_ENABLED), no key, no daily
// limit set, the day's limit used up, or the model failed or wasn't reachable.
export type AiOffReason = 'disabled' | 'no-key' | 'no-limit' | 'daily-limit'

export type AiStatus = { model: string } & ({ on: true; callsToday: number; dailyLimit: number } | { on: false; reason: AiOffReason })

export type AlertView = {
  id: string
  kind: 'doctor-team' | 'move-stock' | 'watch'
  municipality: string
  barangay: string
  audience: string[]
  epiWeek: string
  // The wording offered (or approved): GPT-6 Luna's when it passed the check,
  // else the template.
  text: string
  templateText: string
  // Codes, demo place names, the ISO week, counts as sent ("<5") and ranges.
  facts: Record<string, unknown>
  source: 'luna' | 'template'
  // Why GPT-6 Luna's wording was not used (its check failed), if it wasn't.
  checkReasons: string[]
  // Why the template is shown when the AI wasn't asked or didn't answer.
  aiNote: string | null
  status: 'draft' | 'approved' | 'rejected'
  createdAt: string
  // Roles, never names.
  decidedByRole: string | null
  decidedAt: string | null
}

// POST /api/alerts-draft { municipality } (view code).
export type DraftAlertsResponse = { ok: true; ai: AiStatus; alerts: AlertView[] }

export type AuditView = { at: string; actor: string; action: string; detail: Record<string, unknown> }

// GET /api/alerts?municipality=SID (view code).
export type AlertsResponse = { ok: true; ai: AiStatus; drafts: AlertView[]; decided: AlertView[]; audit: AuditView[] }

// POST /api/alerts-approve { id, approverRole, text? } and
// POST /api/alerts-reject { id, role } (view code).
export type DecideResponse = { ok: true; alert: AlertView }

// POST /api/inbox, signed like a sync (data: {}), by an enrolled laptop key
// (its municipality's approved alerts) or a vouched phone key (its barangay's).
export type InboxAlert = {
  id: string
  kind: AlertView['kind']
  barangay: string
  epiWeek: string
  text: string
  approvedAt: string
  approvedByRole: string
}

export type InboxResponse = {
  ok: true
  scope: { device: 'laptop' | 'phone'; municipality: string; barangays: string[] | null }
  checkedAt: string
  alerts: InboxAlert[]
}

// A role the officer types when deciding, e.g. "Provincial health officer":
// letters, spaces, dots, hyphens and apostrophes, 3 to 60 characters.
export const ROLE_PATTERN = /^[A-Za-z][A-Za-z .'-]{2,59}$/
