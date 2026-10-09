import { beforeAll, describe, expect, it } from 'vitest'
import { decodePairing, encodePairing, isPairingText, PAIRING_PREFIX, type PairingResult } from './pairing'
import { generateDeviceKeyPair, keyFingerprint, type DeviceKeyPair } from './sign'
import { base64url, fromBase64url } from './testFixtures'

let device: DeviceKeyPair
let text: string

beforeAll(async () => {
  device = await generateDeviceKeyPair()
  text = encodePairing({ barangay: 'SID-MAL', municipality: 'SID', publicJwk: device.publicJwk })
})

const wire = (json: string) => PAIRING_PREFIX + base64url(new TextEncoder().encode(json))
const bodyJson = (pairingText: string) => new TextDecoder().decode(fromBase64url(pairingText.slice(PAIRING_PREFIX.length)))

function expectError(result: PairingResult, code: string) {
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.code).toBe(code)
}

describe('encodePairing / decodePairing', () => {
  it('round-trips the key and codes, with the same fingerprint the phone shows', async () => {
    const result = await decodePairing(text)
    expect(result).toEqual({
      ok: true,
      pairing: { barangay: 'SID-MAL', municipality: 'SID', publicJwk: device.publicJwk },
      fingerprint: await keyFingerprint(device.publicJwk),
    })
  })

  it('is "AGPK1." + base64url of compact JSON: the key coordinates and the two codes, nothing else', () => {
    expect(text).toMatch(/^AGPK1\.[A-Za-z0-9_-]+$/)
    expect(JSON.parse(bodyJson(text))).toEqual({
      x: device.publicJwk.x,
      y: device.publicJwk.y,
      b: 'SID-MAL',
      m: 'SID',
    })
  })

  it('is 173 characters for any P-256 key (measured; the README quotes it)', async () => {
    const other = await generateDeviceKeyPair()
    expect(text).toHaveLength(173)
    expect(encodePairing({ barangay: 'SID-RIV', municipality: 'SID', publicJwk: other.publicJwk })).toHaveLength(173)
  })

  it('never carries a private key, even when handed a full private JWK', async () => {
    const extractable = await generateDeviceKeyPair({ extractable: true })
    const privateJwk = await crypto.subtle.exportKey('jwk', extractable.privateKey)
    expect(privateJwk.d).toBeTypeOf('string')
    const fromPrivate = encodePairing({ barangay: 'SID-MAL', municipality: 'SID', publicJwk: privateJwk })
    expect(bodyJson(fromPrivate)).not.toContain(privateJwk.d!)
    expect(fromPrivate).toBe(encodePairing({ barangay: 'SID-MAL', municipality: 'SID', publicJwk: extractable.publicJwk }))
  })

  it('refuses bad codes or keys when encoding', () => {
    const jwk = device.publicJwk
    expect(() => encodePairing({ barangay: 'Maligaya', municipality: 'SID', publicJwk: jwk })).toThrow(RangeError)
    expect(() => encodePairing({ barangay: 'XYZ-MAL', municipality: 'SID', publicJwk: jwk })).toThrow('does not belong')
    expect(() => encodePairing({ barangay: 'SID-MAL', municipality: 'sid', publicJwk: jwk })).toThrow(RangeError)
    expect(() => encodePairing({ barangay: 'SID-MAL', municipality: 'SID', publicJwk: { kty: 'RSA' } })).toThrow('P-256')
  })

  it('ignores whitespace a scanner adds', async () => {
    expect((await decodePairing(`\n${text}  `)).ok).toBe(true)
  })

  it('tells a pairing QR apart from a counts QR', () => {
    expect(isPairingText(text)).toBe(true)
    expect(isPairingText('AGP1.eyJ2IjoxfQ.sig')).toBe(false)
    expect(isPairingText('https://example.com')).toBe(false)
  })
})

describe('decodePairing errors', () => {
  it('not-pairing: a counts QR, a URL or empty text', async () => {
    expectError(await decodePairing('AGP1.abc.def'), 'not-pairing')
    expectError(await decodePairing('https://example.com/AGPK1.'), 'not-pairing')
    expectError(await decodePairing(''), 'not-pairing')
  })

  it('bad-version: another pairing version', async () => {
    expectError(await decodePairing(`AGPK2.${text.slice(PAIRING_PREFIX.length)}`), 'bad-version')
  })

  it('invalid-pairing: not base64url, not JSON, or not an object', async () => {
    expectError(await decodePairing('AGPK1.not base64!'), 'invalid-pairing')
    expectError(await decodePairing(wire('not json')), 'invalid-pairing')
    expectError(await decodePairing(wire('[1,2]')), 'invalid-pairing')
  })

  it('invalid-pairing: extra, missing or renamed keys', async () => {
    const { x, y } = device.publicJwk
    expectError(await decodePairing(wire(JSON.stringify({ x, y, b: 'SID-MAL', m: 'SID', n: 'Juan' }))), 'invalid-pairing')
    expectError(await decodePairing(wire(JSON.stringify({ x, y, b: 'SID-MAL' }))), 'invalid-pairing')
    expectError(await decodePairing(wire(JSON.stringify({ x, y, d: 'secret', m: 'SID' }))), 'invalid-pairing')
  })

  it('invalid-pairing: free text in the codes, or a barangay outside the municipality', async () => {
    const { x, y } = device.publicJwk
    expectError(await decodePairing(wire(JSON.stringify({ x, y, b: 'Maligaya-D', m: 'SID' }))), 'invalid-pairing')
    expectError(await decodePairing(wire(JSON.stringify({ x, y, b: 'ABC-MAL', m: 'SID' }))), 'invalid-pairing')
  })

  it('invalid-pairing: reordered keys or added spacing (one text form per pairing)', async () => {
    const { x, y } = device.publicJwk
    expectError(await decodePairing(wire(JSON.stringify({ b: 'SID-MAL', m: 'SID', x, y }))), 'invalid-pairing')
    expectError(await decodePairing(wire(JSON.stringify({ x, y, b: 'SID-MAL', m: 'SID' }, null, 1))), 'invalid-pairing')
  })

  it('invalid-pairing: coordinates of the wrong length, or a point that is not on the curve', async () => {
    const { x, y } = device.publicJwk
    expectError(await decodePairing(wire(JSON.stringify({ x: x.slice(1), y, b: 'SID-MAL', m: 'SID' }))), 'invalid-pairing')
    // A well-formed 32-byte x with the wrong y: the right shape, but not a P-256 point.
    const wrongY = base64url(new Uint8Array(32).fill(7))
    expectError(await decodePairing(wire(JSON.stringify({ x, y: wrongY, b: 'SID-MAL', m: 'SID' }))), 'invalid-pairing')
  })
})
