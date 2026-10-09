import { BARANGAY_PATTERN, isPlainObject, MUNICIPALITY_PATTERN } from './schema.js'
import { importPublicKey, keyFingerprint, toPublicJwk, type PublicJwk } from './sign.js'

// The pairing QR: how a barangay phone's public key reaches the municipal
// laptop once, before its first counts QR.
//
//   "AGPK1." + base64url(compact JSON {"x","y","b","m"})
//
// x and y are the P-256 public key's coordinates (kty "EC" and crv "P-256" are
// implied), b the barangay code and m the municipality code. There is no
// signature: anyone can make a pairing QR, so the laptop shows the key's
// fingerprint (keyFingerprint) and the officer pairs only after checking it
// matches the one on the phone's screen.

export const PAIRING_PREFIX = 'AGPK1.'

export type Pairing = {
  barangay: string
  municipality: string
  publicJwk: PublicJwk
}

export type PairingErrorCode =
  // Not a pairing QR (a counts QR, a URL, a product code...).
  | 'not-pairing'
  // A pairing QR of a version this app can't read.
  | 'bad-version'
  // Malformed, codes outside their patterns, or not a usable P-256 key.
  | 'invalid-pairing'

export type PairingResult =
  | { ok: true; pairing: Pairing; fingerprint: string }
  | { ok: false; code: PairingErrorCode; message: string }

const WIRE_KEYS = ['x', 'y', 'b', 'm']

function toBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

// Checks the codes and the key; returns the problems, worded without echoing
// the values.
function pairingProblems(barangay: unknown, municipality: unknown, jwk: JsonWebKey): string[] {
  const problems: string[] = []
  const municipalityOk = typeof municipality === 'string' && MUNICIPALITY_PATTERN.test(municipality)
  if (!municipalityOk) problems.push('municipality: must be 3 capital letters or digits')
  if (typeof barangay !== 'string' || !BARANGAY_PATTERN.test(barangay)) {
    problems.push('barangay: must be the municipality code, a dash and 3 capital letters or digits')
  } else if (municipalityOk && !barangay.startsWith(`${municipality}-`)) {
    problems.push('barangay: does not belong to the municipality')
  }
  if (!toPublicJwk(jwk)) problems.push('key: not a P-256 public key')
  return problems
}

function wireText(pairing: Pairing): string {
  const { x, y } = pairing.publicJwk
  return JSON.stringify({ x, y, b: pairing.barangay, m: pairing.municipality })
}

// The text for the phone's pairing QR. Takes the public key only (a private
// JWK's "d" is never read). Throws a RangeError for a bad code or key.
export function encodePairing(pairing: { barangay: string; municipality: string; publicJwk: JsonWebKey }): string {
  const problems = pairingProblems(pairing.barangay, pairing.municipality, pairing.publicJwk)
  if (problems.length > 0) throw new RangeError(`invalid pairing: ${problems.join('; ')}`)
  const publicJwk = toPublicJwk(pairing.publicJwk)!
  const text = wireText({ barangay: pairing.barangay, municipality: pairing.municipality, publicJwk })
  return PAIRING_PREFIX + toBase64url(new TextEncoder().encode(text))
}

export function isPairingText(text: string): boolean {
  return /^AGPK\d{1,3}\./.test(text.trim())
}

function fail(code: PairingErrorCode, message: string): PairingResult {
  return { ok: false, code, message }
}

// Reads a scanned pairing QR: the prefix and version, the exact JSON this
// encoder writes (no extra keys, spacing or reordering), the codes, and a key
// that Web Crypto accepts as a P-256 point. Never throws for bad input.
export async function decodePairing(text: string): Promise<PairingResult> {
  const trimmed = text.trim()
  const prefix = /^AGPK(\d{1,3})\./.exec(trimmed)
  if (!prefix) return fail('not-pairing', 'This is not an Agapay pairing QR code.')
  if (prefix[1] !== '1') {
    return fail('bad-version', `Agapay pairing QR version ${prefix[1]} can't be read here; this app reads version 1.`)
  }
  const body = trimmed.slice(PAIRING_PREFIX.length)
  const bytes = fromBase64url(body)
  if (!bytes) return fail('invalid-pairing', 'The pairing QR is not base64url.')
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return fail('invalid-pairing', 'The pairing QR is not UTF-8 JSON.')
  }
  if (!isPlainObject(value)) return fail('invalid-pairing', 'The pairing QR is not a JSON object.')
  const keys = Object.keys(value)
  if (keys.length !== WIRE_KEYS.length || keys.some((key) => !WIRE_KEYS.includes(key))) {
    return fail('invalid-pairing', 'The pairing QR has unknown or missing keys.')
  }
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: value.x as string, y: value.y as string }
  const problems = pairingProblems(value.b, value.m, jwk)
  if (problems.length > 0) return fail('invalid-pairing', `Invalid pairing QR: ${problems.join('; ')}.`)
  const pairing: Pairing = {
    barangay: value.b as string,
    municipality: value.m as string,
    publicJwk: toPublicJwk(jwk)!,
  }
  // One pairing has exactly one text form, as with the counts QR.
  if (encodePairing(pairing) !== trimmed) return fail('invalid-pairing', 'The pairing QR is not in canonical form.')
  if (!(await importPublicKey(pairing.publicJwk))) {
    return fail('invalid-pairing', 'The pairing QR does not hold a usable P-256 public key.')
  }
  return { ok: true, pairing, fingerprint: await keyFingerprint(pairing.publicJwk) }
}
