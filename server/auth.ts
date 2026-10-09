import { createHash, timingSafeEqual } from 'node:crypto'
import { SIGNATURE_BYTES, fromBase64url, importPublicKey, keyFingerprint, verifyBytes } from '../src/qr/index.js'
import { HttpError, parseJson } from './http.js'
import { MAX_CLOCK_SKEW_MS, NONCE_TTL_MS, type EnrollResponse, type SignedEnvelope } from './protocol.js'
import type { DeviceRecord, Store } from './store.js'
import { validateEnrollBody, validateEnvelope } from './validate.js'

// Who may do what:
// - A municipal laptop enrolls its own key once with the enroll code
//   (MUNICIPAL_ENROLL_CODE), signing the request with that key.
// - Every later laptop request is signed with the enrolled key, carries a ts
//   within MAX_CLOCK_SKEW_MS of the server's clock, and a nonce never seen
//   before (nonces are kept NONCE_TTL_MS, longer than any accepted ts).
// - The DOH view sends its view code (DOH_VIEW_CODE) in a header.
// Codes are compared as SHA-256 digests with timingSafeEqual, so the time
// taken doesn't depend on how much of a guess was right, or on its length.

export function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

// True when `header` is a base64url ECDSA P-256 / SHA-256 signature of
// `bytes` by `publicJwk`.
export async function verifySignature(publicJwk: JsonWebKey, bytes: Uint8Array<ArrayBuffer>, header: string | null): Promise<boolean> {
  if (!header) return false
  const signature = fromBase64url(header.trim())
  if (!signature || signature.length !== SIGNATURE_BYTES) return false
  const key = await importPublicKey(publicJwk)
  return key ? verifyBytes(key, bytes, signature) : false
}

// POST /api/enroll, after the rate limit. The body must be signed by the key
// it enrolls, and its code must match.
export async function enroll(
  store: Store,
  enrollCode: string,
  bytes: Uint8Array<ArrayBuffer>,
  signatureHeader: string | null,
  now: Date,
): Promise<EnrollResponse> {
  const body = validateEnrollBody(parseJson(bytes))
  if (!(await verifySignature(body.publicJwk, bytes, signatureHeader))) {
    throw new HttpError('bad-signature', 'The request must be signed with the key being enrolled.')
  }
  const fingerprint = await keyFingerprint(body.publicJwk)
  if (!sameSecret(body.code, enrollCode)) {
    await store.audit({ at: now, actor: fingerprint, action: 'enroll-refused', detail: { municipality: body.municipality } })
    throw new HttpError('wrong-code', 'That enroll code is not right.')
  }
  await store.putDevice({ fingerprint, role: 'municipal', municipality: body.municipality, publicJwk: body.publicJwk, enrolledAt: now })
  await store.audit({ at: now, actor: fingerprint, action: 'enroll', detail: { municipality: body.municipality } })
  return { ok: true, fingerprint, municipality: body.municipality }
}

export type Authenticated = { device: DeviceRecord; envelope: SignedEnvelope<unknown> }

// Checks a signed request: the envelope's shape, its time, the key its
// fingerprint resolves to, the signature over the exact bytes, then the nonce
// (only a correctly signed request can use one up). The same rules for an
// enrolled laptop and for a phone key a laptop vouched for.
export async function verifySigned<K extends { publicJwk: JsonWebKey }>(
  store: Store,
  bytes: Uint8Array<ArrayBuffer>,
  signatureHeader: string | null,
  now: Date,
  resolve: (fingerprint: string) => Promise<K | null>,
): Promise<{ key: K; envelope: SignedEnvelope<unknown> }> {
  const envelope = validateEnvelope(parseJson(bytes))
  if (Math.abs(now.getTime() - envelope.ts) > MAX_CLOCK_SKEW_MS) {
    throw new HttpError('stale-request', "The request's time is more than 5 minutes from the server's. Check this device's clock.")
  }
  const key = await resolve(envelope.fingerprint)
  if (!key) throw new HttpError('unknown-device', 'This device is not registered or paired on the server.')
  if (!(await verifySignature(key.publicJwk, bytes, signatureHeader))) {
    throw new HttpError('bad-signature', "The signature doesn't match this device's registered key.")
  }
  const fresh = await store.claimNonce(`${envelope.fingerprint}:${envelope.nonce}`, now, new Date(now.getTime() - NONCE_TTL_MS))
  if (!fresh) throw new HttpError('replayed', 'This request was already received.')
  return { key, envelope }
}

// A signed request from an enrolled municipal laptop.
export async function authenticate(
  store: Store,
  bytes: Uint8Array<ArrayBuffer>,
  signatureHeader: string | null,
  now: Date,
): Promise<Authenticated> {
  const { key, envelope } = await verifySigned(store, bytes, signatureHeader, now, (fingerprint) => store.getDevice(fingerprint))
  return { device: key, envelope }
}

// The DOH view's code, from its header (handlers.ts limits and logs the
// wrong ones per address).
export const viewCodeMatches = (given: string | null, viewCode: string): boolean => given !== null && sameSecret(given, viewCode)
