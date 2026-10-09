import { createPayload, encodeQr, generateDeviceKeyPair, keyFingerprint, type PublicJwk, type RawCounts } from '../../src/qr/index.js'
import type { Deps } from '../handlers.js'
import { SIGNATURE_HEADER, signBody, signEnvelope, VIEW_CODE_HEADER, type SyncData } from '../protocol.js'
import type { Store } from '../store.js'

// Synthetic devices, QRs and requests for the server tests. Invented codes
// and counts only ("SID" is the demo's San Isidro Demo).

export const ENROLL_CODE = 'test-enroll-code'
export const VIEW_CODE = 'test-view-code'
// Not a real database: the unit tests hand the handlers an in-memory store.
export const TEST_DATABASE_URL = 'postgres://unit-test.invalid/agapay'
export const NOW = new Date('2026-10-10T01:00:00.000Z')

export type TestDevice = { privateKey: CryptoKey; publicJwk: PublicJwk; fingerprint: string }

export async function makeDevice(): Promise<TestDevice> {
  const pair = await generateDeviceKeyPair()
  return { privateKey: pair.privateKey, publicJwk: pair.publicJwk, fingerprint: await keyFingerprint(pair.publicJwk) }
}

export const COUNTS: RawCounts = {
  exposed: { under2m: 0, m2to12: 2, y1to5: 9, y5to17: 21, y18to59: 40, y60plus: 6 },
  inWatchWindow: 12,
  fastBreathing: { under2m: 0, m2to12: 1, y1to5: 5 },
  urgentReferrals: 0,
  doxyCapsulesOnHand: 40,
  doxyCapsulesExpiring6w: 30,
  clinicianReviewFlags: 3,
}

export async function qrText(
  phone: TestDevice,
  { barangay = 'SID-MAL', epiWeek = '2026-W41', seq = 1, counts = COUNTS }: { barangay?: string; epiWeek?: string; seq?: number; counts?: RawCounts } = {},
): Promise<string> {
  const municipality = barangay.slice(0, 3)
  return encodeQr(createPayload({ municipality, barangay, epiWeek, seq, counts }), phone.privateKey)
}

export function deps(store: Store, overrides: Partial<Deps['env']> = {}, now: Date = NOW): Deps {
  return {
    env: { databaseUrl: TEST_DATABASE_URL, enrollCode: ENROLL_CODE, viewCode: VIEW_CODE, ...overrides },
    openStore: async () => store,
    now: () => now,
  }
}

const BASE = 'https://agapay.test'

export function post(path: string, body: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7', ...headers },
  })
}

export async function enrollRequest(
  laptop: TestDevice,
  { code = ENROLL_CODE, municipality = 'SID', signer = laptop }: { code?: string; municipality?: string; signer?: TestDevice } = {},
): Promise<Request> {
  const signed = await signBody(signer.privateKey, JSON.stringify({ publicJwk: laptop.publicJwk, municipality, code }))
  return post('/api/enroll', signed.body, { [SIGNATURE_HEADER]: signed.signature })
}

export async function syncRequest(
  laptop: TestDevice,
  data: SyncData,
  { now = NOW, nonce, signer = laptop }: { now?: Date; nonce?: string; signer?: TestDevice } = {},
): Promise<Request> {
  const signed = await signEnvelope(signer.privateKey, laptop.fingerprint, data, { now, nonce })
  return post('/api/sync', signed.body, { [SIGNATURE_HEADER]: signed.signature })
}

export function reportsRequest(municipality = 'SID', code: string | null = VIEW_CODE): Request {
  return new Request(`${BASE}/api/reports?municipality=${municipality}`, {
    headers: { 'x-real-ip': '203.0.113.7', ...(code === null ? {} : { [VIEW_CODE_HEADER]: code }) },
  })
}

export async function body<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T
}
