import { beforeEach, describe, expect, it } from 'vitest'
import { handleEnroll, handleSync } from './handlers.js'
import type { SyncData, SyncResponse } from './protocol.js'
import { syncReports } from './sync.js'
import { createMemoryStore, type MemoryStore } from './test/memoryStore.js'
import { body, deps, enrollRequest, makeDevice, NOW, qrText, syncRequest, type TestDevice } from './test/fixtures.js'

let store: MemoryStore
let laptop: TestDevice
let mal: TestDevice
let bgs: TestDevice

beforeEach(async () => {
  store = createMemoryStore()
  ;[laptop, mal, bgs] = await Promise.all([makeDevice(), makeDevice(), makeDevice()])
  expect((await handleEnroll(await enrollRequest(laptop), deps(store))).status).toBe(200)
})

let clock = NOW.getTime()
// Each sync a second later, with its own nonce.
async function sync(data: SyncData, from: TestDevice = laptop): Promise<SyncResponse> {
  clock += 1000
  const now = new Date(clock)
  const response = await handleSync(await syncRequest(from, data, { now }), deps(store, {}, now))
  expect(response.status).toBe(200)
  return body<SyncResponse>(response)
}

const keyOf = (barangay: string, phone: TestDevice) => ({ barangay, publicJwk: phone.publicJwk })

describe('sync', () => {
  it('stores vouched keys and verified reports, and logs counts only', async () => {
    const result = await sync({
      barangayKeys: [keyOf('SID-MAL', mal), keyOf('SID-BGS', bgs)],
      reports: [await qrText(mal, { seq: 3 }), await qrText(bgs, { barangay: 'SID-BGS', seq: 7 })],
    })
    expect(result.barangayKeys).toEqual([
      { barangay: 'SID-MAL', ok: true, status: 'stored' },
      { barangay: 'SID-BGS', ok: true, status: 'stored' },
    ])
    expect(result.reports).toEqual([
      { index: 0, ok: true, barangay: 'SID-MAL', epiWeek: '2026-W41', seq: 3, status: 'stored' },
      { index: 1, ok: true, barangay: 'SID-BGS', epiWeek: '2026-W41', seq: 7, status: 'stored' },
    ])
    const stored = store.reports.get('SID-MAL|2026-W41')
    expect(stored).toMatchObject({ seq: 3, municipality: 'SID', phoneFingerprint: mal.fingerprint, receivedFrom: laptop.fingerprint })
    // Only the verified payload: codes, the week, seq and suppressed counts.
    expect(Object.keys(stored!.payload as object).sort()).toEqual(['barangay', 'counts', 'epiWeek', 'municipality', 'seq', 'version'])
    expect(store.keys.get('SID-MAL')).toMatchObject({ fingerprint: mal.fingerprint, vouchedBy: laptop.fingerprint })
    const audit = store.auditLog.at(-1)!
    expect(audit).toMatchObject({ actor: laptop.fingerprint, action: 'sync' })
    expect(audit.detail).toEqual({ barangayKeys: { stored: 2 }, reports: { stored: 2 } })
  })

  it('refuses a report from a barangay with no vouched key, per item', async () => {
    const result = await sync({
      barangayKeys: [keyOf('SID-MAL', mal)],
      reports: [await qrText(bgs, { barangay: 'SID-BGS' }), await qrText(mal)],
    })
    expect(result.reports[0]).toEqual({ index: 0, ok: false, code: 'unknown-device', barangay: 'SID-BGS' })
    expect(result.reports[1]).toMatchObject({ ok: true, status: 'stored' })
    expect(store.reports.has('SID-BGS|2026-W41')).toBe(false)
  })

  it('refuses a QR signed by another phone than the vouched one', async () => {
    const result = await sync({ barangayKeys: [keyOf('SID-MAL', mal)], reports: [await qrText(bgs, { barangay: 'SID-MAL' })] })
    expect(result.reports[0]).toMatchObject({ ok: false, code: 'bad-signature', barangay: 'SID-MAL' })
  })

  it('refuses a tampered QR', async () => {
    const text = await qrText(mal, { seq: 4 })
    const [prefix, payload, signature] = text.split('.')
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    json.w = 99 // more people in the watch window than the phone sent
    const forged = `${prefix}.${Buffer.from(JSON.stringify(json)).toString('base64url')}.${signature}`
    const result = await sync({ barangayKeys: [keyOf('SID-MAL', mal)], reports: [forged, 'AGP1.garbage.x', 'https://example.com'] })
    expect(result.reports.map((item) => (item.ok ? item.status : item.code))).toEqual(['bad-signature', 'invalid-payload', 'not-agapay'])
    expect(store.reports.size).toBe(0)
  })

  it('keeps the newest seq per barangay and week', async () => {
    const keys = [keyOf('SID-MAL', mal)]
    expect((await sync({ barangayKeys: keys, reports: [await qrText(mal, { seq: 5 })] })).reports[0]).toMatchObject({ status: 'stored' })
    // An older export of the same week: the server keeps 5.
    expect((await sync({ barangayKeys: keys, reports: [await qrText(mal, { seq: 4 })] })).reports[0]).toMatchObject({
      ok: true,
      seq: 4,
      status: 'kept-newer',
    })
    // The same export again.
    expect((await sync({ barangayKeys: keys, reports: [await qrText(mal, { seq: 5 })] })).reports[0]).toMatchObject({ status: 'unchanged' })
    expect(store.reports.get('SID-MAL|2026-W41')?.seq).toBe(5)
    // A newer one replaces it; another week is its own row.
    await sync({ barangayKeys: keys, reports: [await qrText(mal, { seq: 6 }), await qrText(mal, { seq: 2, epiWeek: '2026-W42' })] })
    expect(store.reports.get('SID-MAL|2026-W41')?.seq).toBe(6)
    expect(store.reports.get('SID-MAL|2026-W42')?.seq).toBe(2)
    // Both in one request, newest first: still the newest.
    await sync({ barangayKeys: keys, reports: [await qrText(mal, { seq: 9 }), await qrText(mal, { seq: 8 })] })
    expect(store.reports.get('SID-MAL|2026-W41')?.seq).toBe(9)
    expect(store.keys.get('SID-MAL')?.fingerprint).toBe(mal.fingerprint)
  })

  it("replaces a barangay's report when its vouched phone changed, even at a lower seq", async () => {
    await sync({ barangayKeys: [keyOf('SID-MAL', mal)], reports: [await qrText(mal, { seq: 9 })] })
    const newPhone = await makeDevice()
    const result = await sync({ barangayKeys: [keyOf('SID-MAL', newPhone)], reports: [await qrText(newPhone, { seq: 1 }), await qrText(mal, { seq: 10 })] })
    expect(result.barangayKeys[0]).toMatchObject({ ok: true, status: 'stored' })
    expect(result.reports[0]).toMatchObject({ ok: true, status: 'stored' })
    // The old phone's key is no longer vouched for.
    expect(result.reports[1]).toMatchObject({ ok: false, code: 'bad-signature' })
    expect(store.reports.get('SID-MAL|2026-W41')).toMatchObject({ seq: 1, phoneFingerprint: newPhone.fingerprint })
  })

  it('refuses a key or report for another municipality (cross-municipality vouch)', async () => {
    const result = await sync({
      barangayKeys: [keyOf('ABC-MAL', mal), keyOf('SID-BGS', bgs)],
      reports: [await qrText(mal, { barangay: 'ABC-MAL' })],
    })
    expect(result.barangayKeys).toEqual([
      { barangay: 'ABC-MAL', ok: false, code: 'other-municipality' },
      { barangay: 'SID-BGS', ok: true, status: 'stored' },
    ])
    expect(result.reports[0]).toMatchObject({ ok: false, code: 'other-municipality', barangay: 'ABC-MAL' })
    expect(store.keys.has('ABC-MAL')).toBe(false)
  })

  it("can't use another municipality's vouched keys either", async () => {
    // A laptop enrolled for ABC vouches for its own barangay.
    const otherLaptop = await makeDevice()
    expect((await handleEnroll(await enrollRequest(otherLaptop, { municipality: 'ABC' }), deps(store))).status).toBe(200)
    await sync({ barangayKeys: [keyOf('ABC-MAL', mal)], reports: [] }, otherLaptop)
    // The SID laptop can't upload ABC's reports, even though the key is known.
    const result = await sync({ barangayKeys: [], reports: [await qrText(mal, { barangay: 'ABC-MAL' })] })
    expect(result.reports[0]).toMatchObject({ ok: false, code: 'other-municipality' })
  })

  it('reports an unchanged key, and a point that is not on the curve as invalid', async () => {
    await sync({ barangayKeys: [keyOf('SID-MAL', mal)], reports: [] })
    const offCurve = { ...mal.publicJwk, y: mal.publicJwk.x }
    const result = await sync({ barangayKeys: [keyOf('SID-MAL', mal), { barangay: 'SID-BGS', publicJwk: offCurve }], reports: [] })
    expect(result.barangayKeys).toEqual([
      { barangay: 'SID-MAL', ok: true, status: 'unchanged' },
      { barangay: 'SID-BGS', ok: false, code: 'invalid-key' },
    ])
  })

  it('refuses a future week or one more than 8 weeks old, per item, with a clear message', async () => {
    // NOW is Saturday 2026-W41 in Manila: W42 (2 days away) and W33 (8 weeks back) are accepted.
    const result = await sync({
      barangayKeys: [keyOf('SID-MAL', mal)],
      reports: [
        await qrText(mal, { epiWeek: '2026-W43', seq: 7 }),
        await qrText(mal, { epiWeek: '2099-W01', seq: 8 }),
        await qrText(mal, { epiWeek: '2026-W32', seq: 1 }),
        await qrText(mal, { epiWeek: '2026-W42', seq: 3 }),
        await qrText(mal, { epiWeek: '2026-W33', seq: 2 }),
      ],
    })
    const message =
      "The report's week is outside the weeks the server accepts (2026-W33 to 2026-W42): a future week, or one more than 8 weeks old. Check the phone's date."
    expect(result.reports.slice(0, 3)).toEqual([
      { index: 0, ok: false, code: 'invalid-payload', barangay: 'SID-MAL', message },
      { index: 1, ok: false, code: 'invalid-payload', barangay: 'SID-MAL', message },
      { index: 2, ok: false, code: 'invalid-payload', barangay: 'SID-MAL', message },
    ])
    expect(result.reports.slice(3).map((item) => item.ok && item.status)).toEqual(['stored', 'stored'])
    expect([...store.reports.keys()].sort()).toEqual(['SID-MAL|2026-W33', 'SID-MAL|2026-W42'])
    expect(store.auditLog.at(-1)?.detail).toEqual({ barangayKeys: { stored: 1 }, reports: { 'invalid-payload': 3, stored: 2 } })
  })

  it('writes nothing when the transaction fails', async () => {
    const device = store.devices.get(laptop.fingerprint)!
    const failing = { ...store, audit: async () => Promise.reject(new Error('disk full')) }
    failing.transaction = (work) => store.transaction(() => work(failing))
    const error = await syncReports(failing, device, { barangayKeys: [keyOf('SID-MAL', mal)], reports: [await qrText(mal)] }, NOW).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Error)
    expect(store.keys.size).toBe(0)
    expect(store.reports.size).toBe(0)
  })
})
