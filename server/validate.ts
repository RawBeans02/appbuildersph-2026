import { BARANGAY_PATTERN, MUNICIPALITY_PATTERN, isPlainObject, toPublicJwk, type PublicJwk } from '../src/qr/index.js'
import { HttpError } from './http.js'
import {
  FINGERPRINT_PATTERN,
  MAX_CODE_LENGTH,
  MAX_QR_TEXT,
  MAX_SYNC_KEYS,
  MAX_SYNC_REPORTS,
  NONCE_PATTERN,
  type EnrollBody,
  type SignedEnvelope,
  type SyncData,
} from './protocol.js'

// Strict request shapes: exactly the expected keys at every level, codes in
// their fixed patterns, bounded lengths. Anything else is a 400 whose message
// names the field, never the value sent. The QR texts themselves are checked
// by src/qr's decodeQr (schema, canonical bytes, signature) in sync.ts.

function bad(message: string): never {
  throw new HttpError('bad-request', message)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function object(value: unknown, keys: readonly string[], what: string): Record<string, unknown> {
  if (!isPlainObject(value) || !hasExactKeys(value, keys)) bad(`${what} must be an object with exactly: ${keys.join(', ')}.`)
  return value
}

// Only the public members of a P-256 key, nothing else (no "d").
export function publicJwkOf(value: unknown, what: string): PublicJwk {
  const jwk = isPlainObject(value) && hasExactKeys(value, ['kty', 'crv', 'x', 'y']) ? toPublicJwk(value) : null
  if (!jwk) bad(`${what} must be a P-256 public key (kty, crv, x, y only).`)
  return jwk
}

export function municipalityOf(value: unknown, what = 'municipality'): string {
  if (typeof value !== 'string' || !MUNICIPALITY_PATTERN.test(value)) bad(`${what} must be 3 capital letters or digits.`)
  return value
}

export function validateEnrollBody(value: unknown): EnrollBody {
  const body = object(value, ['publicJwk', 'municipality', 'code'], 'The body')
  const { code } = body
  if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE_LENGTH) {
    bad(`code must be a string of 1 to ${MAX_CODE_LENGTH} characters.`)
  }
  return { publicJwk: publicJwkOf(body.publicJwk, 'publicJwk'), municipality: municipalityOf(body.municipality), code }
}

export function validateEnvelope(value: unknown): SignedEnvelope<unknown> {
  const body = object(value, ['fingerprint', 'ts', 'nonce', 'data'], 'The body')
  const { fingerprint, ts, nonce, data } = body
  if (typeof fingerprint !== 'string' || !FINGERPRINT_PATTERN.test(fingerprint)) bad('fingerprint must look like 3F2A-91C0-7B1E-04D2.')
  if (typeof ts !== 'number' || !Number.isSafeInteger(ts) || ts <= 0) bad('ts must be milliseconds since 1970 as a whole number.')
  if (typeof nonce !== 'string' || !NONCE_PATTERN.test(nonce)) bad('nonce must be 22 to 64 base64url characters.')
  if (!isPlainObject(data)) bad('data must be an object.')
  return { fingerprint, ts, nonce, data }
}

const ASCII_PRINTABLE = /^[\x21-\x7e]+$/

export function validateSyncData(value: unknown): SyncData {
  const data = object(value, ['barangayKeys', 'reports'], 'data')
  const { barangayKeys, reports } = data
  if (!Array.isArray(barangayKeys) || barangayKeys.length > MAX_SYNC_KEYS) {
    bad(`data.barangayKeys must be a list of at most ${MAX_SYNC_KEYS}.`)
  }
  if (!Array.isArray(reports) || reports.length > MAX_SYNC_REPORTS) {
    bad(`data.reports must be a list of at most ${MAX_SYNC_REPORTS}.`)
  }
  const seen = new Set<string>()
  const keys = barangayKeys.map((item: unknown, i) => {
    const entry = object(item, ['barangay', 'publicJwk'], `data.barangayKeys[${i}]`)
    const { barangay } = entry
    if (typeof barangay !== 'string' || !BARANGAY_PATTERN.test(barangay)) {
      bad(`data.barangayKeys[${i}].barangay must be a code like SID-MAL.`)
    }
    if (seen.has(barangay)) bad(`data.barangayKeys[${i}] repeats a barangay.`)
    seen.add(barangay)
    return { barangay, publicJwk: publicJwkOf(entry.publicJwk, `data.barangayKeys[${i}].publicJwk`) }
  })
  const texts = reports.map((text: unknown, i) => {
    if (typeof text !== 'string' || text.length > MAX_QR_TEXT || !ASCII_PRINTABLE.test(text)) {
      bad(`data.reports[${i}] must be QR text (printable ASCII, at most ${MAX_QR_TEXT} characters).`)
    }
    return text
  })
  return { barangayKeys: keys, reports: texts }
}
