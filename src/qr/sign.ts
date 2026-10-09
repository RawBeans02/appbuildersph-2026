// Device keys and signatures: ECDSA P-256 with SHA-256 through Web Crypto
// (crypto.subtle), built into browsers (secure contexts: HTTPS or localhost)
// and into Node 20+ as the global crypto. No library.
//
// Each barangay phone makes its own key pair. The municipal laptop keeps a
// registry of barangay code → public key (JWK) and accepts a QR only when it
// verifies against the key registered for the barangay it names.

const KEY_ALGORITHM: EcKeyImportParams = { name: 'ECDSA', namedCurve: 'P-256' }
const SIGN_ALGORITHM: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' }

// Web Crypto ECDSA signatures are raw r || s (IEEE P1363): 64 bytes for P-256.
export const SIGNATURE_BYTES = 64

// Only the public members of a P-256 key: what goes in the registry.
export type PublicJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string }

// Barangay code (e.g. "SID-MAL") → that device's public key.
export type KeyRegistry = Readonly<Record<string, JsonWebKey>>

export type DeviceKeyPair = {
  // Non-extractable by default: it can sign, and be stored in IndexedDB as a
  // CryptoKey, but its secret can't be read out.
  privateKey: CryptoKey
  publicKey: CryptoKey
  publicJwk: PublicJwk
}

const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/

// The public members of a P-256 JWK, or null when it isn't one. Drops
// everything else (d, key_ops, ext...), so a registry entry can't carry a
// private key or extra fields into the fingerprint.
export function toPublicJwk(jwk: JsonWebKey): PublicJwk | null {
  const { kty, crv, x, y } = jwk
  if (kty !== 'EC' || crv !== 'P-256') return null
  if (typeof x !== 'string' || typeof y !== 'string') return null
  if (!BASE64URL_32_BYTES.test(x) || !BASE64URL_32_BYTES.test(y)) return null
  return { kty, crv, x, y }
}

export async function generateDeviceKeyPair(options: { extractable?: boolean } = {}): Promise<DeviceKeyPair> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(KEY_ALGORITHM, options.extractable ?? false, [
    'sign',
    'verify',
  ])
  const publicJwk = toPublicJwk(await crypto.subtle.exportKey('jwk', publicKey))
  if (!publicJwk) throw new Error('Web Crypto returned a public key that is not P-256')
  return { privateKey, publicKey, publicJwk }
}

export async function signBytes(privateKey: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.sign(SIGN_ALGORITHM, privateKey, data))
}

// Imports a registry entry for verifying, or null when it isn't a usable
// P-256 public key.
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey | null> {
  const publicJwk = toPublicJwk(jwk)
  if (!publicJwk) return null
  try {
    return await crypto.subtle.importKey('jwk', publicJwk, KEY_ALGORITHM, false, ['verify'])
  } catch {
    // For example, a point that isn't on the curve.
    return null
  }
}

export async function verifyBytes(
  publicKey: CryptoKey,
  data: Uint8Array<ArrayBuffer>,
  signature: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  if (signature.length !== SIGNATURE_BYTES) return false
  return crypto.subtle.verify(SIGN_ALGORITHM, publicKey, signature, data)
}

// A short, stable fingerprint of a public key for people to compare on the
// phone and the laptop, e.g. "3F2A-91C0-7B1E-04D2": the first 8 bytes of the
// key's RFC 7638 JWK thumbprint (SHA-256 of its required members in a fixed
// order), so key order and extra JWK fields don't change it.
export async function keyFingerprint(jwk: JsonWebKey): Promise<string> {
  const publicJwk = toPublicJwk(jwk)
  if (!publicJwk) throw new TypeError('not a P-256 public key')
  const { crv, kty, x, y } = publicJwk
  const canonical = JSON.stringify({ crv, kty, x, y })
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)))
  const hex = Array.from(digest.subarray(0, 8), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  return hex.match(/.{4}/g)!.join('-')
}
