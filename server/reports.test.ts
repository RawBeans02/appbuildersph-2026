import { beforeEach, describe, expect, it } from 'vitest'
import { handleEnroll, handleHealth, handleReports, handleSync, resetHealthCache } from './handlers.js'
import type { HealthResponse, ReportsResponse } from './protocol.js'
import { createMemoryStore, type MemoryStore } from './test/memoryStore.js'
import { body, COUNTS, deps, enrollRequest, makeDevice, NOW, qrText, reportsRequest, syncRequest, type TestDevice } from './test/fixtures.js'

let store: MemoryStore
let laptop: TestDevice

beforeEach(async () => {
  store = createMemoryStore()
  laptop = await makeDevice()
  expect((await handleEnroll(await enrollRequest(laptop), deps(store))).status).toBe(200)
})

describe('reports (DOH view)', () => {
  it('returns the newest week per barangay, counts as sent, and totals as ranges for the newest week', async () => {
    const [mal, bgs] = await Promise.all([makeDevice(), makeDevice()])
    const data = {
      barangayKeys: [
        { barangay: 'SID-MAL', publicJwk: mal.publicJwk },
        { barangay: 'SID-BGS', publicJwk: bgs.publicJwk },
      ],
      reports: [
        await qrText(mal, { seq: 1, epiWeek: '2026-W40' }),
        await qrText(mal, { seq: 2, epiWeek: '2026-W41' }),
        await qrText(bgs, { barangay: 'SID-BGS', seq: 3, counts: { ...COUNTS, inWatchWindow: 3, doxyCapsulesOnHand: 100 } }),
      ],
    }
    expect((await handleSync(await syncRequest(laptop, data), deps(store))).status).toBe(200)

    const response = await handleReports(reportsRequest('SID'), deps(store))
    expect(response.status).toBe(200)
    const result = await body<ReportsResponse>(response)
    expect(result.rows.map((row) => [row.barangay, row.epiWeek, row.seq])).toEqual([
      ['SID-BGS', '2026-W41', 3],
      ['SID-MAL', '2026-W41', 2],
    ])
    const mali = result.rows[1]
    expect(mali).toMatchObject({ receivedAt: NOW.toISOString(), receivedFrom: laptop.fingerprint, phoneFingerprint: mal.fingerprint })
    // As sent: small numbers stay "<5".
    expect(mali.counts.exposed.m2to12).toBe('<5')
    expect(result.rows[0].counts.inWatchWindow).toBe('<5')
    expect(result.totals).toMatchObject({ epiWeek: '2026-W41', barangays: 2 })
    expect(result.totals!.counts.inWatchWindow).toEqual({ min: 13, max: 16 })
    expect(result.totals!.counts.doxyCapsulesOnHand).toEqual({ min: 140, max: 140 })
    // Nothing else rides along: each row has exactly these fields.
    expect(Object.keys(mali).sort()).toEqual(['barangay', 'counts', 'epiWeek', 'phoneFingerprint', 'receivedAt', 'receivedFrom', 'seq'])
  })

  it("serves only reports signed by the barangay's currently vouched phone key", async () => {
    const [oldPhone, newPhone] = await Promise.all([makeDevice(), makeDevice()])
    const keyOf = (phone: TestDevice) => ({ barangay: 'SID-MAL', publicJwk: phone.publicJwk })
    expect((await handleSync(await syncRequest(laptop, { barangayKeys: [keyOf(oldPhone)], reports: [await qrText(oldPhone, { epiWeek: '2026-W40' })] }, { now: NOW }), deps(store))).status).toBe(200)
    const before = await body<ReportsResponse>(await handleReports(reportsRequest('SID'), deps(store)))
    expect(before.rows.map((row) => [row.barangay, row.epiWeek, row.phoneFingerprint])).toEqual([['SID-MAL', '2026-W40', oldPhone.fingerprint]])

    // The barangay pairs a new phone: the old phone's week 40 stays stored but isn't served.
    const later = new Date(NOW.getTime() + 1000)
    expect((await handleSync(await syncRequest(laptop, { barangayKeys: [keyOf(newPhone)], reports: [] }, { now: later }), deps(store, {}, later))).status).toBe(200)
    expect(store.reports.has('SID-MAL|2026-W40')).toBe(true)
    const between = await body<ReportsResponse>(await handleReports(reportsRequest('SID'), deps(store)))
    expect(between.rows).toEqual([])
    expect(between.totals).toBeNull()

    // Once the new phone sends, its report is served.
    const last = new Date(NOW.getTime() + 2000)
    await handleSync(await syncRequest(laptop, { barangayKeys: [], reports: [await qrText(newPhone, { epiWeek: '2026-W41' })] }, { now: last }), deps(store, {}, last))
    const after = await body<ReportsResponse>(await handleReports(reportsRequest('SID'), deps(store)))
    expect(after.rows.map((row) => [row.epiWeek, row.phoneFingerprint])).toEqual([['2026-W41', newPhone.fingerprint]])
  })

  it('leaves out a stored payload that no longer validates', async () => {
    // Vouched, so it's the validation that leaves it out.
    store.keys.set('SID-MAL', {
      barangay: 'SID-MAL',
      municipality: 'SID',
      publicJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' },
      fingerprint: '0000-0000-0000-0000',
      vouchedBy: laptop.fingerprint,
      updatedAt: NOW,
    })
    store.reports.set('SID-MAL|2026-W41', {
      barangay: 'SID-MAL',
      epiWeek: '2026-W41',
      seq: 1,
      municipality: 'SID',
      payload: { version: 1, note: 'Residente 001' },
      phoneFingerprint: '0000-0000-0000-0000',
      receivedFrom: laptop.fingerprint,
      receivedAt: NOW,
    })
    const result = await body<ReportsResponse>(await handleReports(reportsRequest('SID'), deps(store)))
    expect(result.rows).toEqual([])
    expect(result.totals).toBeNull()
    expect(JSON.stringify(result)).not.toContain('Residente')
  })

  it('needs a municipality code', async () => {
    const response = await handleReports(reportsRequest('San%20Isidro'), deps(store))
    expect(response.status).toBe(400)
  })
})

describe('health', () => {
  beforeEach(() => resetHealthCache())

  it('says what is configured, as booleans only', async () => {
    const response = await handleHealth(new Request('https://agapay.test/api/health'), deps(store))
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      ok: true,
      database: { configured: true, reachable: true },
      enrollConfigured: true,
      viewConfigured: true,
    } satisfies HealthResponse)
    expect(text).not.toContain('test-enroll-code')
    expect(text).not.toContain('unit-test.invalid')
  })

  it('reports missing settings and an unreachable database', async () => {
    const none = await body<HealthResponse>(
      await handleHealth(new Request('https://agapay.test/api/health'), deps(store, { databaseUrl: null, enrollCode: null, viewCode: null })),
    )
    expect(none).toEqual({ ok: true, database: { configured: false, reachable: false }, enrollConfigured: false, viewConfigured: false })
    const down = deps(store)
    down.openStore = async () => Promise.reject(new Error('connection refused'))
    const result = await body<HealthResponse>(await handleHealth(new Request('https://agapay.test/api/health'), down))
    expect(result.database).toEqual({ configured: true, reachable: false })
  })
})
