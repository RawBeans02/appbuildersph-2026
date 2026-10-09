import { beforeAll, describe, expect, it } from 'vitest'
import {
  generateDeviceKeyPair,
  importPublicKey,
  keyFingerprint,
  SIGNATURE_BYTES,
  signBytes,
  toPublicJwk,
  verifyBytes,
  type DeviceKeyPair,
} from './sign'

// A throwaway public key made for this test (its private half was never kept).
// Its fingerprint was computed separately with Python's hashlib over the RFC
// 7638 form {"crv","kty","x","y"}.
const FIXED_JWK: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'NYW9j6UcvP9I5GHf36BCWHvmYnhrWI2_k1U0836FVws',
  y: 'EOlLXCbsVouCor3nB7Zo7EKbkeocGChSDYadoJ-axHk',
}
const FIXED_FINGERPRINT = '3109-7D1D-0CAB-216B'

const data = new TextEncoder().encode('AGP1.payload')

let device: DeviceKeyPair
let other: DeviceKeyPair
beforeAll(async () => {
  ;[device, other] = await Promise.all([generateDeviceKeyPair(), generateDeviceKeyPair()])
})

describe('generateDeviceKeyPair', () => {
  it('makes a P-256 key pair whose private half cannot be exported', async () => {
    expect(Object.keys(device.publicJwk).sort()).toEqual(['crv', 'kty', 'x', 'y'])
    expect(device.publicJwk).toMatchObject({ kty: 'EC', crv: 'P-256' })
    expect(device.privateKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('jwk', device.privateKey)).rejects.toThrow()
  })

  it('can make an exportable key when asked (for the seed generator)', async () => {
    const exportable = await generateDeviceKeyPair({ extractable: true })
    expect((await crypto.subtle.exportKey('jwk', exportable.privateKey)).d).toBeTypeOf('string')
  })
})

describe('sign and verify', () => {
  it('verifies its own signature, a raw 64-byte r || s', async () => {
    const signature = await signBytes(device.privateKey, data)
    expect(signature).toHaveLength(SIGNATURE_BYTES)
    const key = await importPublicKey(device.publicJwk)
    expect(await verifyBytes(key!, data, signature)).toBe(true)
  })

  it('rejects other data, another key, a flipped bit and a wrong length', async () => {
    const signature = await signBytes(device.privateKey, data)
    const key = (await importPublicKey(device.publicJwk))!
    const otherKey = (await importPublicKey(other.publicJwk))!
    expect(await verifyBytes(key, new TextEncoder().encode('AGP1.payloaD'), signature)).toBe(false)
    expect(await verifyBytes(otherKey, data, signature)).toBe(false)
    const flipped = signature.slice()
    flipped[10] ^= 1
    expect(await verifyBytes(key, data, flipped)).toBe(false)
    expect(await verifyBytes(key, data, signature.slice(0, 63))).toBe(false)
  })
})

describe('registry keys', () => {
  it('keeps only the public members of a JWK', async () => {
    const exportable = await generateDeviceKeyPair({ extractable: true })
    const privateJwk = await crypto.subtle.exportKey('jwk', exportable.privateKey)
    expect(toPublicJwk(privateJwk)).toEqual(exportable.publicJwk)
  })

  it('refuses keys that are not P-256 public keys', async () => {
    expect(toPublicJwk({ kty: 'RSA', n: 'abc', e: 'AQAB' })).toBeNull()
    expect(toPublicJwk({ ...FIXED_JWK, crv: 'P-384' })).toBeNull()
    expect(toPublicJwk({ ...FIXED_JWK, x: 'short' })).toBeNull()
    expect(await importPublicKey({ kty: 'RSA' })).toBeNull()
    // Right shape, but not a point on the curve.
    expect(await importPublicKey({ ...FIXED_JWK, y: FIXED_JWK.x })).toBeNull()
  })
})

describe('keyFingerprint', () => {
  it('is the first 8 bytes of the RFC 7638 thumbprint, in hex groups', async () => {
    expect(await keyFingerprint(FIXED_JWK)).toBe(FIXED_FINGERPRINT)
  })

  it('ignores member order and extra members', async () => {
    const reordered: JsonWebKey = { y: FIXED_JWK.y, x: FIXED_JWK.x, crv: 'P-256', kty: 'EC', key_ops: ['verify'], ext: true }
    expect(await keyFingerprint(reordered)).toBe(FIXED_FINGERPRINT)
  })

  it('differs between devices', async () => {
    const [a, b] = await Promise.all([keyFingerprint(device.publicJwk), keyFingerprint(other.publicJwk)])
    expect(a).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/)
    expect(a).not.toBe(b)
  })

  it('refuses a key that is not P-256', async () => {
    await expect(keyFingerprint({ kty: 'RSA' })).rejects.toThrow(TypeError)
  })
})
