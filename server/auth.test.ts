import { beforeEach, describe, expect, it } from 'vitest'
import { sameSecret } from './auth.js'
import { handleEnroll, handleReports, handleSync } from './handlers.js'
import { MAX_CLOCK_SKEW_MS, SIGNATURE_HEADER, signEnvelope } from './protocol.js'
import { createMemoryStore, type MemoryStore } from './test/memoryStore.js'
import {
  body,
  deps,
  enrollRequest,
  makeDevice,
  NOW,
  post,
  reportsRequest,
  syncRequest,
  type TestDevice,
} from './test/fixtures.js'

const EMPTY = { barangayKeys: [], reports: [] }

let store: MemoryStore
let laptop: TestDevice

beforeEach(async () => {
  store = createMemoryStore()
  laptop = await makeDevice()
})

async function enrolled(): Promise<void> {
  const response = await handleEnroll(await enrollRequest(laptop), deps(store))
  expect(response.status).toBe(200)
}

describe('sameSecret', () => {
  it('matches only the exact code, whatever the lengths', () => {
    expect(sameSecret('abc', 'abc')).toBe(true)
    expect(sameSecret('abd', 'abc')).toBe(false)
    expect(sameSecret('ab', 'abc')).toBe(false)
    expect(sameSecret('', 'abc')).toBe(false)
    expect(sameSecret('abc ', 'abc')).toBe(false)
  })
})

describe('enroll', () => {
  it('stores the laptop key and answers its fingerprint, never the code', async () => {
    const response = await handleEnroll(await enrollRequest(laptop), deps(store))
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ ok: true, fingerprint: laptop.fingerprint, municipality: 'SID' })
    expect(text).not.toContain('test-enroll-code')
    expect(store.devices.get(laptop.fingerprint)).toMatchObject({ role: 'municipal', municipality: 'SID', publicJwk: laptop.publicJwk })
    expect(store.auditLog.map((entry) => entry.action)).toEqual(['enroll'])
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('refuses a wrong enroll code with 403 and logs the refusal', async () => {
    const response = await handleEnroll(await enrollRequest(laptop, { code: 'guess' }), deps(store))
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({ ok: false, error: 'wrong-code' })
    expect(store.devices.size).toBe(0)
    expect(store.auditLog).toEqual([expect.objectContaining({ action: 'enroll-refused', actor: laptop.fingerprint })])
  })

  it('refuses a request not signed by the key it enrolls', async () => {
    const other = await makeDevice()
    const response = await handleEnroll(await enrollRequest(laptop, { signer: other }), deps(store))
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ error: 'bad-signature' })
    expect(store.devices.size).toBe(0)
  })

  it('refuses a request with no signature', async () => {
    const response = await handleEnroll(
      post('/api/enroll', JSON.stringify({ publicJwk: laptop.publicJwk, municipality: 'SID', code: 'test-enroll-code' })),
      deps(store),
    )
    expect(response.status).toBe(401)
  })

  it('answers 503 "not configured" when the enroll code or the database is not set', async () => {
    for (const missing of [{ enrollCode: null }, { databaseUrl: null }]) {
      const response = await handleEnroll(await enrollRequest(laptop), deps(store, missing))
      expect(response.status).toBe(503)
      expect(await body(response)).toMatchObject({ ok: false, error: 'not-configured' })
    }
    expect(store.devices.size).toBe(0)
    expect(store.rateLimits.size).toBe(0)
  })
})

describe('signed requests', () => {
  it('accepts a correctly signed, fresh request from an enrolled laptop', async () => {
    await enrolled()
    const response = await handleSync(await syncRequest(laptop, EMPTY), deps(store))
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ ok: true, barangayKeys: [], reports: [] })
  })

  it('refuses a bad signature', async () => {
    await enrolled()
    const impostor = await makeDevice()
    const response = await handleSync(await syncRequest(laptop, EMPTY, { signer: impostor }), deps(store))
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ error: 'bad-signature' })
  })

  it('refuses a body changed after signing', async () => {
    await enrolled()
    const signed = await signEnvelope(laptop.privateKey, laptop.fingerprint, EMPTY, { now: NOW })
    const changed = signed.body.replace('"reports":[]', '"reports": []')
    const response = await handleSync(post('/api/sync', changed, { [SIGNATURE_HEADER]: signed.signature }), deps(store))
    expect(response.status).toBe(401)
  })

  it('refuses an expired or future ts', async () => {
    await enrolled()
    for (const offset of [-(MAX_CLOCK_SKEW_MS + 1000), MAX_CLOCK_SKEW_MS + 1000]) {
      const at = new Date(NOW.getTime() + offset)
      const response = await handleSync(await syncRequest(laptop, EMPTY, { now: at }), deps(store))
      expect(response.status).toBe(401)
      expect(await body(response)).toMatchObject({ error: 'stale-request' })
    }
    // Within the window is fine.
    const close = new Date(NOW.getTime() - MAX_CLOCK_SKEW_MS + 1000)
    expect((await handleSync(await syncRequest(laptop, EMPTY, { now: close }), deps(store))).status).toBe(200)
  })

  it('refuses a replayed nonce, even with a fresh signature', async () => {
    await enrolled()
    const nonce = 'AAAAAAAAAAAAAAAAAAAAAA'
    expect((await handleSync(await syncRequest(laptop, EMPTY, { nonce }), deps(store))).status).toBe(200)
    const replay = await handleSync(await syncRequest(laptop, EMPTY, { nonce }), deps(store))
    expect(replay.status).toBe(409)
    expect(await body(replay)).toMatchObject({ error: 'replayed' })
  })

  it('replays the exact same request: refused', async () => {
    await enrolled()
    const signed = await signEnvelope(laptop.privateKey, laptop.fingerprint, EMPTY, { now: NOW })
    const send = () => handleSync(post('/api/sync', signed.body, { [SIGNATURE_HEADER]: signed.signature }), deps(store))
    expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(409)
  })

  it('forgets nonces after their time-to-live, by which point the ts is refused anyway', async () => {
    await enrolled()
    await handleSync(await syncRequest(laptop, EMPTY), deps(store))
    expect(store.nonces.size).toBe(1)
    const later = new Date(NOW.getTime() + 11 * 60_000)
    await handleSync(await syncRequest(laptop, EMPTY, { now: later }), deps(store, {}, later))
    expect(store.nonces.size).toBe(1)
  })

  it('refuses a laptop that never enrolled', async () => {
    const response = await handleSync(await syncRequest(laptop, EMPTY), deps(store))
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ error: 'unknown-device' })
    expect(store.nonces.size).toBe(0)
  })

  it('answers 503 for sync when the database is not set', async () => {
    const response = await handleSync(await syncRequest(laptop, EMPTY), deps(store, { databaseUrl: null }))
    expect(response.status).toBe(503)
  })
})

describe('DOH view code', () => {
  it('opens the reports with the right code only', async () => {
    expect((await handleReports(reportsRequest('SID'), deps(store))).status).toBe(200)
    const wrong = await handleReports(reportsRequest('SID', 'nope'), deps(store))
    expect(wrong.status).toBe(403)
    expect(await body(wrong)).toMatchObject({ error: 'wrong-code' })
    expect((await handleReports(reportsRequest('SID', null), deps(store))).status).toBe(403)
  })

  it('answers 503 "not configured" when the view code is not set, never an open view', async () => {
    for (const code of ['test-view-code', 'anything', null]) {
      const response = await handleReports(reportsRequest('SID', code), deps(store, { viewCode: null }))
      expect(response.status).toBe(503)
      expect(await body(response)).toMatchObject({ error: 'not-configured' })
    }
  })

  it('logs each read as the doh-view role, with counts only', async () => {
    await handleReports(reportsRequest('SID'), deps(store))
    expect(store.auditLog).toEqual([expect.objectContaining({ actor: 'doh-view', action: 'view-reports', detail: { municipality: 'SID', rows: 0 } })])
  })
})
