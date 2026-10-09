import { describe, expect, it } from 'vitest'
import { handleEnroll, handleSync } from './handlers.js'
import { HttpError, readBody } from './http.js'
import { MAX_BODY_BYTES, MAX_SYNC_REPORTS, SIGNATURE_HEADER } from './protocol.js'
import { createMemoryStore } from './test/memoryStore.js'
import { body, deps, enrollRequest, makeDevice, post, syncRequest } from './test/fixtures.js'
import { validateEnrollBody, validateEnvelope, validateSyncData } from './validate.js'

const JWK = { kty: 'EC', crv: 'P-256', x: 'ss0x9NQIFOK8qGbi07-rr0EBZaPvVjTLAghk2vmeU-4', y: 'WiPaAjDCfIYnskCOoY8j4SxzIp88pYzll3naxeVQcu4' }

function refused(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).code).toBe('bad-request')
    return (error as HttpError).message
  }
  throw new Error('expected a 400')
}

describe('enroll body', () => {
  it('takes exactly publicJwk, municipality and code', () => {
    expect(validateEnrollBody({ publicJwk: JWK, municipality: 'SID', code: 'x' })).toEqual({ publicJwk: JWK, municipality: 'SID', code: 'x' })
    refused(() => validateEnrollBody({ publicJwk: JWK, municipality: 'SID' }))
    refused(() => validateEnrollBody({ publicJwk: JWK, municipality: 'SID', code: 'x', name: 'Juan' }))
    refused(() => validateEnrollBody([JWK, 'SID', 'x']))
    refused(() => validateEnrollBody({ publicJwk: JWK, municipality: 'San Isidro', code: 'x' }))
    refused(() => validateEnrollBody({ publicJwk: JWK, municipality: 'SID', code: '' }))
    refused(() => validateEnrollBody({ publicJwk: JWK, municipality: 'SID', code: 'x'.repeat(257) }))
  })

  it('takes a public P-256 key only: no private part, no extra members', () => {
    refused(() => validateEnrollBody({ publicJwk: { ...JWK, d: JWK.x }, municipality: 'SID', code: 'x' }))
    refused(() => validateEnrollBody({ publicJwk: { ...JWK, crv: 'P-384' }, municipality: 'SID', code: 'x' }))
    refused(() => validateEnrollBody({ publicJwk: { ...JWK, x: 'short' }, municipality: 'SID', code: 'x' }))
  })

  it("never echoes the value in the message", () => {
    const message = refused(() => validateEnrollBody({ publicJwk: JWK, municipality: 'Residente 001', code: 'x' }))
    expect(message).not.toContain('Residente')
  })
})

describe('signed envelope', () => {
  const ok = { fingerprint: '3F2A-91C0-7B1E-04D2', ts: 1_791_594_000_000, nonce: 'AAAAAAAAAAAAAAAAAAAAAA', data: {} }

  it('takes exactly fingerprint, ts, nonce and data', () => {
    expect(validateEnvelope(ok)).toEqual(ok)
    refused(() => validateEnvelope({ ...ok, extra: 1 }))
    refused(() => validateEnvelope({ ...ok, fingerprint: '3f2a-91c0-7b1e-04d2' }))
    refused(() => validateEnvelope({ ...ok, ts: '1791594000000' }))
    refused(() => validateEnvelope({ ...ok, ts: 1.5 }))
    refused(() => validateEnvelope({ ...ok, nonce: 'short' }))
    refused(() => validateEnvelope({ ...ok, nonce: 'A'.repeat(21) + '!' }))
    refused(() => validateEnvelope({ ...ok, data: [] }))
  })
})

describe('sync data', () => {
  it('takes keys and QR texts', () => {
    const data = { barangayKeys: [{ barangay: 'SID-MAL', publicJwk: JWK }], reports: ['AGP1.abc.def'] }
    expect(validateSyncData(data)).toEqual(data)
    expect(validateSyncData({ barangayKeys: [], reports: [] })).toEqual({ barangayKeys: [], reports: [] })
  })

  it('refuses extra keys, bad codes, repeats, free text and oversized lists', () => {
    refused(() => validateSyncData({ barangayKeys: [], reports: [], residents: [] }))
    refused(() => validateSyncData({ barangayKeys: [{ barangay: 'SID-MAL', publicJwk: JWK, purok: 'Purok 1' }], reports: [] }))
    refused(() => validateSyncData({ barangayKeys: [{ barangay: 'Maligaya', publicJwk: JWK }], reports: [] }))
    refused(() =>
      validateSyncData({
        barangayKeys: [
          { barangay: 'SID-MAL', publicJwk: JWK },
          { barangay: 'SID-MAL', publicJwk: JWK },
        ],
        reports: [],
      }),
    )
    refused(() => validateSyncData({ barangayKeys: [], reports: ['has a space'] }))
    refused(() => validateSyncData({ barangayKeys: [], reports: [42] }))
    refused(() => validateSyncData({ barangayKeys: [], reports: ['A'.repeat(1025)] }))
    refused(() => validateSyncData({ barangayKeys: [], reports: Array.from({ length: MAX_SYNC_REPORTS + 1 }, () => 'AGP1.a.b') }))
  })
})

describe('body size', () => {
  it('reads a body up to 256 KB and refuses one byte more with 413', async () => {
    const fits = new Request('https://agapay.test/x', { method: 'POST', body: 'a'.repeat(MAX_BODY_BYTES) })
    expect((await readBody(fits)).length).toBe(MAX_BODY_BYTES)
    const over = new Request('https://agapay.test/x', { method: 'POST', body: 'a'.repeat(MAX_BODY_BYTES + 1) })
    const error = await readBody(over).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).toResponse().status).toBe(413)
  })

  it('counts the bytes it reads, not the Content-Length it was told', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(new Uint8Array(64 * 1024))
        controller.close()
      },
    })
    const request = new Request('https://agapay.test/x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    const error = await readBody(request).catch((e: unknown) => e)
    expect((error as HttpError).code).toBe('too-large')
  })

  it('answers 413 from the routes: from Content-Length before any database work, else while reading', async () => {
    const store = createMemoryStore()
    const big = JSON.stringify({ pad: 'a'.repeat(MAX_BODY_BYTES) })
    const declared = { 'content-length': String(big.length) }
    const sync = await handleSync(post('/api/sync', big, { [SIGNATURE_HEADER]: 'x', ...declared }), deps(store))
    expect(sync.status).toBe(413)
    expect(await body(sync)).toMatchObject({ error: 'too-large' })
    expect((await handleEnroll(post('/api/enroll', big, declared), deps(store))).status).toBe(413)
    expect(store.rateLimits.size).toBe(0)
    // No Content-Length: refused once the bytes read pass the limit.
    const undeclared = new Request('https://agapay.test/api/sync', { method: 'POST', body: big })
    undeclared.headers.delete('content-length')
    expect((await handleSync(undeclared, deps(store))).status).toBe(413)
  })

  it('answers 400 for a body that is not JSON or has the wrong shape', async () => {
    const store = createMemoryStore()
    expect((await handleEnroll(post('/api/enroll', 'not json'), deps(store))).status).toBe(400)
    const laptop = await makeDevice()
    expect((await handleEnroll(await enrollRequest(laptop), deps(store))).status).toBe(200)
    const wrongShape = await handleSync(
      await syncRequest(laptop, { barangayKeys: [], reports: [], extra: true } as never),
      deps(store),
    )
    expect(wrongShape.status).toBe(400)
  })
})
