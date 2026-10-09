import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { handleAlertsApprove, handleAlertsDraft, handleEnroll, handleHealth, handleInbox, handleReports, handleSync } from './handlers.js'
import { VIEW_CODE_HEADER, type DraftAlertsResponse } from './protocol.js'
import { post } from './test/fixtures.js'
import { createMemoryStore, type MemoryStore } from './test/memoryStore.js'
import { deps, ENROLL_CODE, makeDevice, NOW, qrText, VIEW_CODE } from './test/fixtures.js'
import type { PairedDevice, ReceivedPayload } from '../src/data/db/types'
import type { Handoff } from '../src/features/municipal/municipal'
import { registerLaptop } from '../src/features/municipal/sync/actions'
import { enrollLaptop, fetchInbox, problemText, readHealth, uploadSync, type Fetcher } from '../src/features/municipal/sync/client'
import { buildSyncData, syncRows } from '../src/features/municipal/sync/results'
import { openSyncStore } from '../src/features/municipal/sync/syncStore'
import { dohView, fetchReports } from '../src/features/doh/view'

// The laptop's sync client against the real server handlers, wired through
// a fetch stand-in (no network): the signatures the laptop makes are the ones
// the server checks.

let server: MemoryStore

function fetcherFor(store: MemoryStore, now = NOW): Fetcher {
  return async (path, init) => {
    const request = new Request(`https://agapay.test${path}`, { ...init, headers: { ...(init?.headers as object), 'x-real-ip': '192.0.2.4' } })
    const route = { '/api/enroll': handleEnroll, '/api/sync': handleSync, '/api/health': handleHealth, '/api/inbox': handleInbox }[path] ??
      (path.startsWith('/api/reports?') ? handleReports : undefined)
    if (!route) throw new TypeError('Failed to fetch')
    return route(request, deps(store, {}, now))
  }
}

let dbCount = 0
const freshStore = () => openSyncStore(`agapay-sync-test-${++dbCount}`)

beforeEach(() => {
  server = createMemoryStore()
})

async function handoffOf(...phones: { barangay: string; seq: number; epiWeek?: string }[]): Promise<{ handoff: Handoff; keys: Map<string, Awaited<ReturnType<typeof makeDevice>>> }> {
  const keys = new Map<string, Awaited<ReturnType<typeof makeDevice>>>()
  const devices: PairedDevice[] = []
  const received: ReceivedPayload[] = []
  for (const { barangay, seq, epiWeek = '2026-W41' } of phones) {
    if (!keys.has(barangay)) {
      const phone = await makeDevice()
      keys.set(barangay, phone)
      devices.push({ barangay, publicJwk: phone.publicJwk, fingerprint: phone.fingerprint, pairedAt: NOW.toISOString(), source: 'pairing' })
    }
    received.push({
      id: `${barangay}:${epiWeek}:${seq}`,
      barangay,
      municipality: 'SID',
      epiWeek,
      seq,
      text: `${await qrText(keys.get(barangay)!, { barangay, seq, epiWeek })}\n`,
      keyFingerprint: keys.get(barangay)!.fingerprint,
      receivedAt: NOW.toISOString(),
    })
  }
  return { handoff: { devices, received }, keys }
}

describe('laptop identity', () => {
  it('is made once, non-extractable, and kept', async () => {
    const store = await freshStore()
    const [a, b] = await Promise.all([store.ensureIdentity(NOW), store.ensureIdentity(NOW)])
    expect(a.fingerprint).toBe(b.fingerprint)
    expect(a.privateKey.extractable).toBe(false)
    expect(a.fingerprint).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/)
    const again = await openSyncStore(`agapay-sync-test-${dbCount}`)
    expect((await again.getIdentity())?.fingerprint).toBe(a.fingerprint)
    // The stored key still signs.
    expect((await again.getIdentity())?.privateKey.usages).toContain('sign')
  })
})

describe('register and sync against the server handlers', () => {
  it('registers with the right code, then syncs and keeps per-barangay results', async () => {
    const store = await freshStore()
    const wrong = await registerLaptop(store, 'not the code', fetcherFor(server), NOW)
    expect(wrong).toEqual({ ok: false, problem: { kind: 'wrong-code' } })
    expect(await store.getEnrollment()).toBeNull()

    const right = await registerLaptop(store, ENROLL_CODE, fetcherFor(server), NOW)
    expect(right.ok).toBe(true)
    const identity = (await store.getIdentity())!
    expect(await store.getEnrollment()).toMatchObject({ fingerprint: identity.fingerprint, municipality: 'SID' })
    expect(server.devices.get(identity.fingerprint)).toBeDefined()

    const { handoff } = await handoffOf({ barangay: 'SID-MAL', seq: 3 }, { barangay: 'SID-BGS', seq: 2 })
    const { data, sent } = buildSyncData(handoff)
    const result = await uploadSync(identity, data, fetcherFor(server), NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(syncRows(sent, result.value)).toEqual([
      { barangay: 'SID-MAL', name: 'Maligaya-D', key: 'Sent', report: 'Week 2026-W41 #3 uploaded', tone: 'ok' },
      { barangay: 'SID-BGS', name: 'Bagong Silang-D', key: 'Sent', report: 'Week 2026-W41 #2 uploaded', tone: 'ok' },
    ])
    expect(server.reports.size).toBe(2)
  })

  it('says why a barangay was refused', async () => {
    const store = await freshStore()
    await registerLaptop(store, ENROLL_CODE, fetcherFor(server), NOW)
    const identity = (await store.getIdentity())!
    const { handoff } = await handoffOf({ barangay: 'SID-MAL', seq: 3 }, { barangay: 'SID-RIV', seq: 1 })
    // Riverside-D's QR came from a phone that isn't the paired one.
    const stranger = await makeDevice()
    handoff.received[1] = { ...handoff.received[1], text: await qrText(stranger, { barangay: 'SID-RIV', seq: 1 }) }
    const { data, sent } = buildSyncData(handoff)
    const result = await uploadSync(identity, data, fetcherFor(server), NOW)
    if (!result.ok) throw new Error('expected the sync to answer')
    const rows = syncRows(sent, result.value)
    expect(rows.find((row) => row.barangay === 'SID-RIV')).toEqual({
      barangay: 'SID-RIV',
      name: 'Riverside-D',
      key: 'Sent',
      report: 'Week 2026-W41 #1 not sent: not signed by the paired phone',
      tone: 'bad',
    })
    // A second sync: the server already has Maligaya-D's export.
    const second = await uploadSync(identity, data, fetcherFor(server), new Date(NOW.getTime() + 1000))
    if (!second.ok) throw new Error('expected the sync to answer')
    expect(syncRows(sent, second.value)[0]).toMatchObject({ key: 'Already on the server', report: 'Week 2026-W41 #3 already on the server' })
  })

  it('says when a report week is in the future (a phone clock ahead)', async () => {
    const store = await freshStore()
    await registerLaptop(store, ENROLL_CODE, fetcherFor(server), NOW)
    const identity = (await store.getIdentity())!
    const { handoff } = await handoffOf({ barangay: 'SID-MAL', seq: 3, epiWeek: '2026-W45' })
    const { data, sent } = buildSyncData(handoff)
    const result = await uploadSync(identity, data, fetcherFor(server), NOW)
    if (!result.ok) throw new Error('expected the sync to answer')
    expect(syncRows(sent, result.value)[0]).toMatchObject({
      report: "Week 2026-W45 #3 not sent: its week is in the future or more than 8 weeks old. Check the phone's date.",
      tone: 'bad',
    })
    expect(server.reports.size).toBe(0)
  })

  it('maps the server answers to problems', async () => {
    const store = await freshStore()
    const identity = await store.ensureIdentity(NOW)
    const empty = { barangayKeys: [], reports: [] }
    // Not enrolled.
    expect(await uploadSync(identity, empty, fetcherFor(server), NOW)).toEqual({ ok: false, problem: { kind: 'not-registered' } })
    // Not configured.
    const off: Fetcher = (path, init) => handleSync(new Request(`https://agapay.test${path}`, init), deps(server, { databaseUrl: null }))
    expect(await uploadSync(identity, empty, off, NOW)).toEqual({ ok: false, problem: { kind: 'not-configured' } })
    // The laptop's clock is 10 minutes off.
    await enrollLaptop(identity, ENROLL_CODE, 'SID', fetcherFor(server))
    expect(await uploadSync(identity, empty, fetcherFor(server), new Date(NOW.getTime() - 10 * 60_000))).toEqual({
      ok: false,
      problem: { kind: 'clock' },
    })
    // No server at all, or something else answering (an HTML page).
    const down: Fetcher = async () => Promise.reject(new TypeError('Failed to fetch'))
    expect(await uploadSync(identity, empty, down, NOW)).toEqual({ ok: false, problem: { kind: 'unreachable' } })
    const html: Fetcher = async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    expect(await uploadSync(identity, empty, html, NOW)).toEqual({ ok: false, problem: { kind: 'unreachable' } })
    // Too many tries.
    const limited: Fetcher = async () =>
      new Response(JSON.stringify({ ok: false, error: 'rate-limited', message: '' }), { status: 429, headers: { 'retry-after': '17' } })
    const result = await uploadSync(identity, empty, limited, NOW)
    expect(result).toEqual({ ok: false, problem: { kind: 'rate-limited', retryAfter: 17 } })
    if (!result.ok) expect(problemText(result.problem).body).toBe('Wait 17 seconds, then try again.')
  })

  it('reads the server health, or null when it cannot', async () => {
    expect(await readHealth(fetcherFor(server))).toMatchObject({ database: { configured: true }, enrollConfigured: true })
    expect(await readHealth(async () => Promise.reject(new TypeError('offline')))).toBeNull()
  })
})

describe('what a sync sends', () => {
  it('sends the paired keys and the received QRs as scanned (trimmed), newest first', async () => {
    const { handoff, keys } = await handoffOf({ barangay: 'SID-MAL', seq: 1, epiWeek: '2026-W40' }, { barangay: 'SID-BGS', seq: 4 })
    const { data, sent } = buildSyncData(handoff)
    expect(data.barangayKeys.map((key) => key.barangay)).toEqual(['SID-BGS', 'SID-MAL'])
    expect(data.barangayKeys[0].publicJwk).toEqual(keys.get('SID-BGS')!.publicJwk)
    expect(sent).toEqual([
      { barangay: 'SID-BGS', epiWeek: '2026-W41', seq: 4 },
      { barangay: 'SID-MAL', epiWeek: '2026-W40', seq: 1 },
    ])
    expect(data.reports.every((text) => /^AGP1\.[\w-]+\.[\w-]+$/.test(text))).toBe(true)
    // Only public key members leave, even if a stored JWK had more.
    const extra = { ...handoff, devices: [{ ...handoff.devices[0], publicJwk: { ...handoff.devices[0].publicJwk, ext: true, key_ops: ['verify'] } }] }
    expect(Object.keys(buildSyncData(extra).data.barangayKeys[0].publicJwk).sort()).toEqual(['crv', 'kty', 'x', 'y'])
  })
})

describe('DOH view client', () => {
  it('reads what the laptop synced, with the view code', async () => {
    const store = await freshStore()
    await registerLaptop(store, ENROLL_CODE, fetcherFor(server), NOW)
    const identity = (await store.getIdentity())!
    const { handoff } = await handoffOf({ barangay: 'SID-MAL', seq: 3 })
    expect((await uploadSync(identity, buildSyncData(handoff).data, fetcherFor(server), NOW)).ok).toBe(true)

    expect(await fetchReports('wrong', 'SID', fetcherFor(server))).toEqual({ ok: false, problem: { kind: 'wrong-code' } })
    const result = await fetchReports(VIEW_CODE, 'SID', fetcherFor(server))
    if (!result.ok) throw new Error('expected the reports')
    const view = dohView(result.value, NOW)
    expect(view.rows.map((row) => [row.name, row.week, row.from])).toEqual([['Maligaya-D', '2026-W41', identity.fingerprint]])
    expect(view.totals).toMatchObject({ week: '2026-W41', barangays: 1 })
  })
})

describe('inbox client (laptop)', () => {
  it('reads the approved alerts for its municipality, signed with the laptop key', async () => {
    const store = await freshStore()
    await registerLaptop(store, ENROLL_CODE, fetcherFor(server), NOW)
    const identity = (await store.getIdentity())!
    const { handoff } = await handoffOf({ barangay: 'SID-MAL', seq: 3 })
    expect((await uploadSync(identity, buildSyncData(handoff).data, fetcherFor(server), NOW)).ok).toBe(true)

    const empty = await fetchInbox(identity, fetcherFor(server), NOW)
    expect(empty.ok && empty.value.alerts).toEqual([])

    const view = { [VIEW_CODE_HEADER]: VIEW_CODE }
    const draftResponse = await handleAlertsDraft(post('/api/alerts-draft', JSON.stringify({ municipality: 'SID' }), view), deps(server))
    const drafted = (await draftResponse.json()) as DraftAlertsResponse
    expect(drafted.alerts.length).toBeGreaterThan(0)
    const first = drafted.alerts[0]
    const approve = post('/api/alerts-approve', JSON.stringify({ id: first.id, municipality: 'SID', approverRole: 'Provincial health officer' }), view)
    expect((await handleAlertsApprove(approve, deps(server))).status).toBe(200)

    const inbox = await fetchInbox(identity, fetcherFor(server), new Date(NOW.getTime() + 1000))
    if (!inbox.ok) throw new Error('expected the inbox')
    expect(inbox.value.scope).toEqual({ device: 'laptop', municipality: 'SID', barangays: null })
    expect(inbox.value.alerts).toEqual([expect.objectContaining({ id: first.id, text: first.text, approvedByRole: 'Provincial health officer' })])
  })

  it("lets a phone read only its own barangay's messages, signed with its device key", async () => {
    const store = await freshStore()
    await registerLaptop(store, ENROLL_CODE, fetcherFor(server), NOW)
    const identity = (await store.getIdentity())!
    // Maligaya-D has 12 in the watch window (a watch alert); Riverside-D none.
    const { handoff, keys } = await handoffOf({ barangay: 'SID-MAL', seq: 3 }, { barangay: 'SID-RIV', seq: 1 })
    expect((await uploadSync(identity, buildSyncData(handoff).data, fetcherFor(server), NOW)).ok).toBe(true)
    const view = { [VIEW_CODE_HEADER]: VIEW_CODE }
    const drafted = (await (await handleAlertsDraft(post('/api/alerts-draft', JSON.stringify({ municipality: 'SID' }), view), deps(server))).json()) as DraftAlertsResponse
    for (const alert of drafted.alerts) {
      const approve = post('/api/alerts-approve', JSON.stringify({ id: alert.id, municipality: 'SID', approverRole: 'Provincial health officer' }), view)
      expect((await handleAlertsApprove(approve, deps(server))).status).toBe(200)
    }
    const later = new Date(NOW.getTime() + 1000)
    const mal = await fetchInbox(keys.get('SID-MAL')!, fetcherFor(server), later)
    const riv = await fetchInbox(keys.get('SID-RIV')!, fetcherFor(server), later)
    if (!mal.ok || !riv.ok) throw new Error('expected both inboxes')
    expect(mal.value.scope).toEqual({ device: 'phone', municipality: 'SID', barangays: ['SID-MAL'] })
    expect(mal.value.alerts.length).toBeGreaterThan(0)
    expect(mal.value.alerts.every((alert) => alert.barangay === 'SID-MAL' || alert.kind === 'move-stock')).toBe(true)
    expect(riv.value.alerts.every((alert) => alert.barangay !== 'SID-MAL' || alert.kind === 'move-stock')).toBe(true)
    // A phone the laptop never vouched for isn't linked.
    expect(await fetchInbox(await makeDevice(), fetcherFor(server), later)).toEqual({ ok: false, problem: { kind: 'not-registered' } })
  })
})
