import { beforeAll, describe, expect, it } from 'vitest'
import { decodeQr, encodeQr, QR_PREFIX, QrError, type DecodeResult } from './codec'
import { createPayload, type QrPayloadV1 } from './schema'
import { generateDeviceKeyPair, keyFingerprint, signBytes, type DeviceKeyPair, type KeyRegistry } from './sign'
import { MAX_COUNT } from './suppress'
import { base64url, fromBase64url, sampleInput } from './testFixtures'

const encoder = new TextEncoder()

let device: DeviceKeyPair
let impostor: DeviceKeyPair
let registry: KeyRegistry
let payload: QrPayloadV1
let text: string

beforeAll(async () => {
  ;[device, impostor] = await Promise.all([generateDeviceKeyPair(), generateDeviceKeyPair()])
  registry = { 'SID-MAL': device.publicJwk }
  payload = createPayload(sampleInput())
  text = await encodeQr(payload, device.privateKey)
})

// Signs any JSON text with a real key, the way a tampered or homemade QR would
// look if its maker held the barangay's key.
async function signJson(json: string, key: CryptoKey = device.privateKey): Promise<string> {
  const signed = QR_PREFIX + base64url(encoder.encode(json))
  return `${signed}.${base64url(await signBytes(key, encoder.encode(signed)))}`
}

function payloadJson(qr: string): string {
  return new TextDecoder().decode(fromBase64url(qr.split('.')[1]))
}

function expectError(result: DecodeResult, code: string) {
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.code).toBe(code)
}

describe('round trip', () => {
  it('decodes what it encodes, with the key fingerprint', async () => {
    const result = await decodeQr(text, registry)
    expect(result).toEqual({ ok: true, payload, keyFingerprint: await keyFingerprint(device.publicJwk) })
  })

  it('is "AGP1." + base64url payload + "." + an 86-character base64url signature', () => {
    expect(text).toMatch(/^AGP1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/)
  })

  it('carries compact JSON with short keys, counts only', () => {
    expect(payloadJson(text)).toBe(
      '{"v":1,"m":"SID","b":"SID-MAL","wk":"2026-W41","n":12,"e":["<5",27,118,642,1484,233],' +
        '"w":412,"f":[0,"<5",14],"u":"<5","d":1200,"x":300,"r":31}',
    )
  })

  it('ignores whitespace a scanner adds around the text', async () => {
    expect((await decodeQr(` ${text}\r\n`, registry)).ok).toBe(true)
  })
})

describe('size', () => {
  // Measured by these tests (Vitest, Node 20): the realistic sample
  // (SAMPLE_COUNTS) encodes to 282 characters, and the largest valid payload to
  // 343. Characters = bytes, since the text is ASCII. Lengths are exact because
  // only the payload part varies; an ECDSA P-256 signature is always 64 bytes,
  // 86 characters.
  it('a realistic full payload encodes to 282 bytes, under 800', () => {
    expect(encoder.encode(text).length).toBe(text.length)
    expect(text.length).toBe(282)
    expect(text.length).toBeLessThan(800)
  })

  it('the largest valid payload (every count and seq at the maximum) encodes to 343 bytes, under 800', async () => {
    const max = createPayload(
      sampleInput({
        seq: MAX_COUNT,
        counts: {
          exposed: { under2m: MAX_COUNT, m2to12: MAX_COUNT, y1to5: MAX_COUNT, y5to17: MAX_COUNT, y18to59: MAX_COUNT, y60plus: MAX_COUNT },
          inWatchWindow: MAX_COUNT,
          fastBreathing: { under2m: MAX_COUNT, m2to12: MAX_COUNT, y1to5: MAX_COUNT },
          urgentReferrals: MAX_COUNT,
          doxyCapsulesOnHand: MAX_COUNT,
          doxyCapsulesExpiring6w: MAX_COUNT,
          clinicianReviewFlags: MAX_COUNT,
        },
      }),
    )
    const longest = await encodeQr(max, device.privateKey)
    expect(longest.length).toBe(343)
    expect(longest.length).toBeLessThan(800)
  })
})

describe('tampering', () => {
  it('rejects a changed count (bad-signature)', async () => {
    const [, , signature] = text.split('.')
    const forged = payloadJson(text).replace('"d":1200', '"d":9200')
    const tampered = `${QR_PREFIX}${base64url(encoder.encode(forged))}.${signature}`
    expectError(await decodeQr(tampered, registry), 'bad-signature')
  })

  it('rejects a changed signature (bad-signature)', async () => {
    const [prefix, body, signature] = text.split('.')
    const flipped = signature.slice(0, 10) + (signature[10] === 'A' ? 'B' : 'A') + signature.slice(11)
    expectError(await decodeQr(`${prefix}.${body}.${flipped}`, registry), 'bad-signature')
    expectError(await decodeQr(`${prefix}.${body}.${signature.slice(0, 40)}`, registry), 'bad-signature')
  })

  it("rejects a QR signed by another phone claiming the barangay's code (bad-signature)", async () => {
    const forged = await encodeQr(payload, impostor.privateKey)
    const result = await decodeQr(forged, registry)
    expectError(result, 'bad-signature')
    expect(result).toMatchObject({ barangay: 'SID-MAL' })
  })

  it('rejects a version changed in the prefix (bad-version), and the signature covers the prefix', async () => {
    expectError(await decodeQr(text.replace(/^AGP1\./, 'AGP2.'), registry), 'bad-version')
  })
})

describe('devices', () => {
  it('rejects a barangay with no registered key (unknown-device)', async () => {
    const result = await decodeQr(text, { 'SID-BAG': device.publicJwk })
    expectError(result, 'unknown-device')
    expect(result).toMatchObject({ barangay: 'SID-MAL' })
    expectError(await decodeQr(text, {}), 'unknown-device')
  })

  it('rejects a registry entry that is not a usable P-256 public key (unknown-device)', async () => {
    expectError(await decodeQr(text, { 'SID-MAL': { kty: 'RSA', n: 'x', e: 'AQAB' } }), 'unknown-device')
  })

  it('does not look up keys on the object prototype', async () => {
    const proto = createPayload(sampleInput({ municipality: 'SID', barangay: 'SID-PRO' }))
    const qr = await encodeQr(proto, device.privateKey)
    expectError(await decodeQr(qr, Object.create({ 'SID-PRO': device.publicJwk })), 'unknown-device')
  })
})

describe('not ours', () => {
  it('rejects other QR content (not-agapay)', async () => {
    for (const other of ['', 'https://example.com/AGP1.', 'agp1.abc.def', 'AGP.abc.def', 'AGPX.abc', '4800016641207']) {
      expectError(await decodeQr(other, registry), 'not-agapay')
    }
  })

  it('rejects an unknown version (bad-version)', async () => {
    expectError(await decodeQr('AGP2.abc.def', registry), 'bad-version')
    expectError(await decodeQr('AGP01.abc.def', registry), 'bad-version')
  })
})

describe('invalid payloads (rejected even with a valid signature)', () => {
  it('rejects a malformed structure', async () => {
    for (const bad of ['AGP1.', 'AGP1.abc', 'AGP1.abc.def.ghi', 'AGP1.ab!c.def', 'AGP1.a.def']) {
      expectError(await decodeQr(bad, registry), 'invalid-payload')
    }
    expectError(await decodeQr(`AGP1.${base64url(new Uint8Array([0xff, 0xfe]))}.x`, registry), 'invalid-payload')
  })

  it('rejects an extra key, even one signed by the registered key', async () => {
    const json = payloadJson(text).replace('{"v":1,', '{"v":1,"name":"Residente 001",')
    expectError(await decodeQr(await signJson(json), registry), 'invalid-payload')
  })

  it('rejects free text in a count or a code', async () => {
    const inCount = payloadJson(text).replace('"w":412', '"w":"Purok 3"')
    expectError(await decodeQr(await signJson(inCount), registry), 'invalid-payload')
    const inCode = payloadJson(text).replace('"wk":"2026-W41"', '"wk":"2026-10-09"')
    expectError(await decodeQr(await signJson(inCode), registry), 'invalid-payload')
  })

  it('rejects an unsuppressed small count', async () => {
    const json = payloadJson(text).replace('"u":"<5"', '"u":1')
    expectError(await decodeQr(await signJson(json), registry), 'invalid-payload')
  })

  it('rejects a duplicate key that would hide text from the validator', async () => {
    const json = payloadJson(text).replace('{"v":1,', '{"v":1,"b":"Juan dela Cruz",')
    // JSON.parse keeps only the last "b", so the parsed object alone looks fine.
    expect(JSON.parse(json).b).toBe('SID-MAL')
    expectError(await decodeQr(await signJson(json), registry), 'invalid-payload')
  })

  it('rejects non-canonical JSON (spacing, key order, number forms)', async () => {
    const json = payloadJson(text)
    const variants = [
      json.replace('"v":1,', '"v": 1,'),
      json.replace('{"v":1,"m":"SID",', '{"m":"SID","v":1,'),
      json.replace('"d":1200', '"d":1.2e3'),
      `${json}\n`,
    ]
    for (const variant of variants) {
      expect(JSON.parse(variant)).toEqual(JSON.parse(json))
      expectError(await decodeQr(await signJson(variant), registry), 'invalid-payload')
    }
  })

  it('rejects band arrays of the wrong length', async () => {
    const json = payloadJson(text).replace('"f":[0,"<5",14]', '"f":[0,"<5",14,0]')
    expectError(await decodeQr(await signJson(json), registry), 'invalid-payload')
  })
})

describe('encodeQr', () => {
  it('refuses a payload that breaks the schema', async () => {
    const unsuppressed = { ...payload, counts: { ...payload.counts, urgentReferrals: 3 } }
    await expect(encodeQr(unsuppressed, device.privateKey)).rejects.toThrow(QrError)
    await expect(encodeQr(unsuppressed, device.privateKey)).rejects.toMatchObject({ code: 'invalid-payload' })
    const withName = { ...payload, name: 'Residente 001' } as QrPayloadV1
    await expect(encodeQr(withName, device.privateKey)).rejects.toMatchObject({ code: 'invalid-payload' })
  })
})
