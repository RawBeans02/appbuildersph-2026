import {
  AGE_BANDS,
  HINGA_AGE_BANDS,
  isPlainObject,
  validatePayload,
  type QrPayloadV1,
  type Validation,
} from './schema.js'
import { importPublicKey, keyFingerprint, signBytes, SIGNATURE_BYTES, verifyBytes, type KeyRegistry } from './sign.js'
import type { Count } from './suppress.js'

// The QR text: "AGP1." + base64url(compact JSON) + "." + base64url(signature).
// The signature covers everything before the last dot, prefix included, so
// the version can't be changed without breaking it. All of it is ASCII, so
// its length in characters is its length in bytes.

export const QR_PREFIX = 'AGP1.'

export type QrErrorCode =
  // Not an AgapayMo QR at all (a URL, a product code...).
  | 'not-agapay'
  // An AgapayMo QR of a version this app can't read.
  | 'bad-version'
  // The signature doesn't match the payload and the barangay's registered key.
  | 'bad-signature'
  // No usable key is registered for the barangay the QR names.
  | 'unknown-device'
  // Malformed, or the payload breaks the schema (unknown keys, free text,
  // unsuppressed counts, a date instead of a week...).
  | 'invalid-payload'

export class QrError extends Error {
  readonly code: QrErrorCode
  constructor(code: QrErrorCode, message: string) {
    super(message)
    this.name = 'QrError'
    this.code = code
  }
}

export type DecodeResult =
  | { ok: true; payload: QrPayloadV1; keyFingerprint: string }
  // `barangay`: the code the QR names, once its payload parsed (bad-signature,
  // unknown-device). Unverified: for the message only, never for the counts.
  | { ok: false; code: QrErrorCode; message: string; barangay?: string }

// The compact JSON: short keys, bands as arrays in AGE_BANDS / HINGA_AGE_BANDS
// order, keys always in this order.
//   v version · m municipality · b barangay · wk epiWeek · n seq
//   e exposed[6] · w inWatchWindow · f fastBreathing[3] · u urgentReferrals
//   d doxyCapsulesOnHand · x doxyCapsulesExpiring6w · r clinicianReviewFlags
type Wire = {
  v: number
  m: string
  b: string
  wk: string
  n: number
  e: Count[]
  w: Count
  f: Count[]
  u: Count
  d: Count
  x: Count
  r: Count
}
const WIRE_KEYS = ['v', 'm', 'b', 'wk', 'n', 'e', 'w', 'f', 'u', 'd', 'x', 'r']

function toWire(payload: QrPayloadV1): Wire {
  const { counts } = payload
  return {
    v: payload.version,
    m: payload.municipality,
    b: payload.barangay,
    wk: payload.epiWeek,
    n: payload.seq,
    e: AGE_BANDS.map((band) => counts.exposed[band]),
    w: counts.inWatchWindow,
    f: HINGA_AGE_BANDS.map((band) => counts.fastBreathing[band]),
    u: counts.urgentReferrals,
    d: counts.doxyCapsulesOnHand,
    x: counts.doxyCapsulesExpiring6w,
    r: counts.clinicianReviewFlags,
  }
}

function bandsFromWire(value: unknown, bands: readonly string[]): unknown {
  if (!Array.isArray(value) || value.length !== bands.length) return undefined
  return Object.fromEntries(bands.map((band, i) => [band, value[i]]))
}

function fromWire(value: unknown): Validation<QrPayloadV1> {
  if (!isPlainObject(value)) return { ok: false, problems: ['not a JSON object'] }
  const keys = Object.keys(value)
  if (keys.length !== WIRE_KEYS.length || keys.some((key) => !WIRE_KEYS.includes(key))) {
    return { ok: false, problems: ['unknown or missing keys'] }
  }
  return validatePayload({
    version: value.v,
    municipality: value.m,
    barangay: value.b,
    epiWeek: value.wk,
    seq: value.n,
    counts: {
      exposed: bandsFromWire(value.e, AGE_BANDS),
      inWatchWindow: value.w,
      fastBreathing: bandsFromWire(value.f, HINGA_AGE_BANDS),
      urgentReferrals: value.u,
      doxyCapsulesOnHand: value.d,
      doxyCapsulesExpiring6w: value.x,
      clinicianReviewFlags: value.r,
    },
  })
}

export function toBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Strict: base64url alphabet, no padding, and the canonical encoding of the
// bytes (no stray low bits), so one byte string has exactly one text form.
export function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return toBase64url(bytes) === text ? bytes : null
}

const encoder = new TextEncoder()

function payloadPart(payload: QrPayloadV1): string {
  return toBase64url(encoder.encode(JSON.stringify(toWire(payload))))
}

// Validates, signs and encodes a payload (build it with createPayload). Throws
// a QrError with code 'invalid-payload' if it breaks the schema.
export async function encodeQr(payload: QrPayloadV1, privateKey: CryptoKey): Promise<string> {
  const checked = validatePayload(payload)
  if (!checked.ok) throw new QrError('invalid-payload', checked.problems.join('; '))
  const signed = QR_PREFIX + payloadPart(checked.value)
  const signature = await signBytes(privateKey, encoder.encode(signed))
  return `${signed}.${toBase64url(signature)}`
}

function fail(code: QrErrorCode, message: string, barangay?: string): DecodeResult {
  return barangay === undefined ? { ok: false, code, message } : { ok: false, code, message, barangay }
}

function parsePayload(part: string): Validation<QrPayloadV1> {
  const bytes = fromBase64url(part)
  if (!bytes) return { ok: false, problems: ['the payload is not base64url'] }
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return { ok: false, problems: ['the payload is not UTF-8 JSON'] }
  }
  const result = fromWire(value)
  // Only the exact bytes this encoder writes are accepted: no spacing, no
  // reordered or duplicate keys (JSON.parse keeps only the last duplicate, so
  // an earlier one could otherwise carry hidden text), no number variants.
  if (result.ok && payloadPart(result.value) !== part) {
    return { ok: false, problems: ['the payload is not in canonical form'] }
  }
  return result
}

// Reads scanned QR text: checks the prefix and version, parses the payload
// strictly, then verifies the signature against the key registered for the
// barangay it names. Surrounding whitespace (some scanners add a newline) is
// ignored. Never throws for bad input; Web Crypto must be available.
export async function decodeQr(text: string, registry: KeyRegistry): Promise<DecodeResult> {
  const trimmed = text.trim()
  const prefix = /^AGP(\d{1,3})\./.exec(trimmed)
  if (!prefix) return fail('not-agapay', 'This is not an AgapayMo QR code.')
  if (prefix[1] !== '1') return fail('bad-version', `AgapayMo QR version ${prefix[1]} can't be read here; this app reads version 1.`)

  const parts = trimmed.slice(QR_PREFIX.length).split('.')
  if (parts.length !== 2) return fail('invalid-payload', 'Expected AGP1.<payload>.<signature>.')
  const [payloadText, signatureText] = parts
  const parsed = parsePayload(payloadText)
  if (!parsed.ok) return fail('invalid-payload', `Invalid payload: ${parsed.problems.join('; ')}.`)
  const payload = parsed.value

  const signature = fromBase64url(signatureText)
  if (!signature || signature.length !== SIGNATURE_BYTES) return fail('bad-signature', 'The signature is malformed.', payload.barangay)

  const jwk = Object.hasOwn(registry, payload.barangay) ? registry[payload.barangay] : undefined
  if (!jwk) return fail('unknown-device', `No device key is registered for barangay ${payload.barangay}.`, payload.barangay)
  const publicKey = await importPublicKey(jwk)
  if (!publicKey) {
    return fail(
      'unknown-device',
      `The key registered for barangay ${payload.barangay} is not a usable P-256 public key.`,
      payload.barangay,
    )
  }

  const signed = encoder.encode(trimmed.slice(0, QR_PREFIX.length + payloadText.length))
  if (!(await verifyBytes(publicKey, signed, signature))) {
    return fail(
      'bad-signature',
      `The signature does not match barangay ${payload.barangay}'s registered key.`,
      payload.barangay,
    )
  }
  return { ok: true, payload, keyFingerprint: await keyFingerprint(jwk) }
}
