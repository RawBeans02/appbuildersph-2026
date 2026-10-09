import { isPlainObject } from '../../../qr'
import {
  SIGNATURE_HEADER,
  signBody,
  signEnvelope,
  type EnrollResponse,
  type HealthResponse,
  type InboxResponse,
  type SyncData,
  type SyncResponse,
} from '../../../../server/protocol'
import type { LaptopIdentity } from './syncStore'

// The laptop's calls to the optional sync API (api/, see server/protocol.ts).
// Every request is signed with the laptop's own key. Any failure comes back
// as a problem to show, never a throw, and leaves this laptop's records as
// they were.

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export type SyncProblem =
  | { kind: 'unreachable' }
  | { kind: 'not-configured' }
  | { kind: 'wrong-code' }
  | { kind: 'not-registered' }
  | { kind: 'clock' }
  | { kind: 'rate-limited'; retryAfter: number }
  // The alerts (DOH view): an edited wording that didn't pass the check, with
  // the check's reasons; an alert someone already decided.
  | { kind: 'check-failed'; reasons: string[] }
  | { kind: 'already-decided' }
  // A newer draft batch replaced the alert.
  | { kind: 'superseded' }
  | { kind: 'failed' }

export type ApiResult<T> = { ok: true; value: T } | { ok: false; problem: SyncProblem }

// One API call: the parsed answer, or the problem to show. Also used by the
// DOH view (src/features/doh/).
export async function callApi<T>(fetcher: Fetcher, path: string, init: RequestInit): Promise<ApiResult<T>> {
  let response: Response
  let body: unknown
  try {
    response = await fetcher(path, { ...init, cache: 'no-store' })
    body = await response.json()
  } catch {
    // No connection, or something that isn't the API answered.
    return { ok: false, problem: { kind: 'unreachable' } }
  }
  if (response.ok && isPlainObject(body) && body.ok === true) return { ok: true, value: body as T }
  const error = isPlainObject(body) ? body.error : undefined
  switch (error) {
    case 'not-configured':
      return { ok: false, problem: { kind: 'not-configured' } }
    case 'wrong-code':
      return { ok: false, problem: { kind: 'wrong-code' } }
    case 'unknown-device':
      return { ok: false, problem: { kind: 'not-registered' } }
    case 'stale-request':
      return { ok: false, problem: { kind: 'clock' } }
    case 'rate-limited':
      return { ok: false, problem: { kind: 'rate-limited', retryAfter: Math.max(1, Number(response.headers.get('retry-after')) || 60) } }
    case 'check-failed': {
      const reasons = isPlainObject(body) && Array.isArray(body.reasons) ? body.reasons.filter((r): r is string => typeof r === 'string') : []
      return { ok: false, problem: { kind: 'check-failed', reasons } }
    }
    case 'already-decided':
      return { ok: false, problem: { kind: 'already-decided' } }
    case 'superseded':
      return { ok: false, problem: { kind: 'superseded' } }
    default:
      return { ok: false, problem: { kind: 'failed' } }
  }
}

const jsonHeaders = (signature: string) => ({ 'content-type': 'application/json', [SIGNATURE_HEADER]: signature })

// Registers this laptop's key once. The request is signed by that key, which
// shows the server the laptop holds it; the code isn't stored anywhere here.
export async function enrollLaptop(
  identity: LaptopIdentity,
  code: string,
  municipality: string,
  fetcher: Fetcher = fetch,
): Promise<ApiResult<EnrollResponse>> {
  const signed = await signBody(identity.privateKey, JSON.stringify({ publicJwk: identity.publicJwk, municipality, code }))
  return callApi<EnrollResponse>(fetcher, '/api/enroll', { method: 'POST', headers: jsonHeaders(signed.signature), body: signed.body })
}

export async function uploadSync(
  identity: LaptopIdentity,
  data: SyncData,
  fetcher: Fetcher = fetch,
  now = new Date(),
): Promise<ApiResult<SyncResponse>> {
  const signed = await signEnvelope(identity.privateKey, identity.fingerprint, data, { now })
  return callApi<SyncResponse>(fetcher, '/api/sync', { method: 'POST', headers: jsonHeaders(signed.signature), body: signed.body })
}

// The approved alerts for this device: a laptop's for its municipality, a
// phone's for its barangay. Signed like a sync; nothing is stored.
export async function fetchInbox(
  device: { privateKey: CryptoKey; fingerprint: string },
  fetcher: Fetcher = fetch,
  now = new Date(),
): Promise<ApiResult<InboxResponse>> {
  const signed = await signEnvelope(device.privateKey, device.fingerprint, {}, { now })
  return callApi<InboxResponse>(fetcher, '/api/inbox', { method: 'POST', headers: jsonHeaders(signed.signature), body: signed.body })
}

// Whether the server has sync set up; null when it can't be reached.
export async function readHealth(fetcher: Fetcher = fetch): Promise<HealthResponse | null> {
  const result = await callApi<HealthResponse>(fetcher, '/api/health', { method: 'GET' })
  return result.ok ? result.value : null
}

// NEEDS DESIGN (TASKS.md P2-B): the wording of the sync problems.
export function problemText(problem: SyncProblem): { title: string; body: string } {
  switch (problem.kind) {
    case 'unreachable':
      return { title: "Couldn't reach the sync server", body: 'Check the internet, then try again. Everything on this laptop is safe.' }
    case 'not-configured':
      return { title: "Sync isn't set up on the server yet", body: 'Everything else works offline, as before.' }
    case 'wrong-code':
      return { title: "That enroll code isn't right", body: 'Check the code and type it again.' }
    case 'not-registered':
      return { title: "This laptop isn't registered on the server", body: 'Register it again with the enroll code.' }
    case 'clock':
      return { title: "This laptop's clock is off", body: 'Set the date and time to automatic, then sync again.' }
    case 'rate-limited':
      return { title: 'Too many tries', body: `Wait ${problem.retryAfter} seconds, then try again.` }
    case 'check-failed':
      return { title: "The wording doesn't match the alert's facts", body: problem.reasons.join(' ') }
    case 'already-decided':
      return { title: 'Someone already decided this alert', body: 'The list now shows what was decided.' }
    case 'superseded':
      return { title: 'A newer draft replaced this alert', body: 'The list now shows the newer drafts.' }
    case 'failed':
      return { title: "Sync didn't finish", body: 'Nothing on this laptop changed. Try again.' }
  }
}
