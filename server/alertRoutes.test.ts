import { beforeEach, describe, expect, it } from 'vitest'
import {
  handleAlerts,
  handleAlertsApprove,
  handleAlertsDraft,
  handleAlertsReject,
  handleEnroll,
  handleInbox,
  handleSync,
} from './handlers.js'
import type { Fetcher } from './luna/draft.js'
import {
  SIGNATURE_HEADER,
  signEnvelope,
  VIEW_CODE_HEADER,
  type AlertsResponse,
  type DecideResponse,
  type DraftAlertsResponse,
  type ErrorResponse,
  type InboxResponse,
} from './protocol.js'
import { LIMITS } from './rateLimit.js'
import { createMemoryStore, type MemoryStore } from './test/memoryStore.js'
import { body, deps, enrollRequest, makeDevice, NOW, post, qrText, syncRequest, VIEW_CODE, type TestDevice } from './test/fixtures.js'
import { SCENARIO_COUNTS } from './test/lunaScenario.js'

// The alerts and inbox routes on the in-memory store, after a real enroll
// and sync. OpenAI is mocked; most tests run with the AI off.

let store: MemoryStore
let laptop: TestDevice
const phones = new Map<string, TestDevice>()
let clock = NOW.getTime()
const tick = () => new Date((clock += 1000))

beforeEach(async () => {
  store = createMemoryStore()
  laptop = await makeDevice()
  expect((await handleEnroll(await enrollRequest(laptop), deps(store))).status).toBe(200)
  const barangayKeys = []
  const reports = []
  for (const [barangay, counts] of Object.entries(SCENARIO_COUNTS)) {
    const phone = await makeDevice()
    phones.set(barangay, phone)
    barangayKeys.push({ barangay, publicJwk: phone.publicJwk })
    reports.push(await qrText(phone, { barangay, counts }))
  }
  const now = tick()
  expect((await handleSync(await syncRequest(laptop, { barangayKeys, reports }, { now }), deps(store, {}, now))).status).toBe(200)
})

const viewPost = (path: string, data: unknown, code = VIEW_CODE) => post(path, JSON.stringify(data), { [VIEW_CODE_HEADER]: code })
const viewGet = (path: string, code = VIEW_CODE) =>
  new Request(`https://agapay.test${path}`, { headers: { [VIEW_CODE_HEADER]: code, 'x-real-ip': '203.0.113.7' } })

async function draft(): Promise<DraftAlertsResponse> {
  const response = await handleAlertsDraft(viewPost('/api/alerts-draft', { municipality: 'SID' }), deps(store))
  expect(response.status).toBe(200)
  return body<DraftAlertsResponse>(response)
}

async function inboxAs(device: TestDevice, { nonce, signer = device, data = {} }: { nonce?: string; signer?: TestDevice; data?: unknown } = {}) {
  const now = tick()
  const signed = await signEnvelope(signer.privateKey, device.fingerprint, data, { now, nonce })
  return handleInbox(post('/api/inbox', signed.body, { [SIGNATURE_HEADER]: signed.signature }), deps(store, {}, now))
}

describe('drafting through the route', () => {
  it('needs the view code, and is closed when it is not set', async () => {
    expect((await handleAlertsDraft(viewPost('/api/alerts-draft', { municipality: 'SID' }, 'nope'), deps(store))).status).toBe(403)
    expect((await handleAlertsDraft(viewPost('/api/alerts-draft', { municipality: 'SID' }), deps(store, { viewCode: null }))).status).toBe(503)
    expect((await handleAlerts(viewGet('/api/alerts?municipality=SID'), deps(store, { viewCode: null }))).status).toBe(503)
  })

  it('drafts template alerts with the AI off, and says so', async () => {
    const result = await draft()
    expect(result.ai).toEqual({ model: 'gpt-6-luna', on: false, reason: 'disabled' })
    expect(result.alerts.map((alert) => [alert.kind, alert.barangay, alert.source])).toEqual([
      ['doctor-team', 'SID-MAL', 'template'],
      ['move-stock', 'SID-BGS', 'template'],
      ['watch', 'SID-MAL', 'template'],
      ['watch', 'SID-RIV', 'template'],
    ])
  })

  it('uses GPT-6 Luna (mocked) when it is on', async () => {
    const fetcher: Fetcher = async (_url, init) => {
      const template = JSON.parse(JSON.parse(String(init!.body)).messages[1].content).template as string
      return new Response(JSON.stringify({ choices: [{ message: { content: `For the officer: ${template}` } }] }))
    }
    const on = deps(store, { lunaEnabled: true, openaiApiKey: 'test-key-not-real', lunaDailyLimit: 10 }, NOW, { fetch: fetcher })
    const response = await handleAlertsDraft(viewPost('/api/alerts-draft', { municipality: 'SID' }), on)
    const result = await body<DraftAlertsResponse>(response)
    expect(result.alerts.every((alert) => alert.source === 'luna' && alert.text.startsWith('For the officer: '))).toBe(true)
    expect(result.ai).toMatchObject({ on: true, callsToday: 4, dailyLimit: 10 })
  })

  it('limits draft requests per address', async () => {
    const statuses: number[] = []
    for (let i = 0; i <= LIMITS['alerts-draft'].max; i++) {
      statuses.push((await handleAlertsDraft(viewPost('/api/alerts-draft', { municipality: 'SID' }), deps(store))).status)
    }
    expect(statuses.at(-1)).toBe(429)
    expect(statuses.slice(0, -1).every((status) => status === 200)).toBe(true)
  })

  it('takes exactly { municipality }', async () => {
    expect((await handleAlertsDraft(viewPost('/api/alerts-draft', { municipality: 'SID', prompt: 'hi' }), deps(store))).status).toBe(400)
  })
})

describe('deciding through the routes', () => {
  it('re-checks an edited wording, approves, and refuses a second decision', async () => {
    const { alerts } = await draft()
    const move = alerts[1]
    const wrong = await handleAlertsApprove(
      viewPost('/api/alerts-approve', { id: move.id, approverRole: 'Provincial health officer', text: move.text.replace('up to 30', 'up to 45') }),
      deps(store),
    )
    expect(wrong.status).toBe(422)
    const problem = await body<ErrorResponse>(wrong)
    expect(problem).toMatchObject({ ok: false, error: 'check-failed' })
    expect(problem.reasons?.join(' ')).toMatch(/45/)

    const ok = await handleAlertsApprove(viewPost('/api/alerts-approve', { id: move.id, approverRole: 'Provincial health officer' }), deps(store))
    expect(ok.status).toBe(200)
    expect((await body<DecideResponse>(ok)).alert).toMatchObject({ status: 'approved', decidedByRole: 'Provincial health officer' })
    const again = await handleAlertsApprove(viewPost('/api/alerts-approve', { id: move.id, approverRole: 'Provincial health officer' }), deps(store))
    expect(again.status).toBe(409)
  })

  it('takes a role, not anything else', async () => {
    const { alerts } = await draft()
    for (const approverRole of ['Dr. 12', 'x', '<b>officer</b>']) {
      expect((await handleAlertsApprove(viewPost('/api/alerts-approve', { id: alerts[0].id, approverRole }), deps(store))).status).toBe(400)
    }
    expect((await handleAlertsApprove(viewPost('/api/alerts-approve', { id: '999', approverRole: 'Regional officer' }), deps(store))).status).toBe(404)
  })

  it('rejects, and lists drafts, decided alerts and the audit trail', async () => {
    const { alerts } = await draft()
    expect((await handleAlertsReject(viewPost('/api/alerts-reject', { id: alerts[3].id, role: 'Regional officer' }), deps(store))).status).toBe(200)
    const list = await body<AlertsResponse>(await handleAlerts(viewGet('/api/alerts?municipality=SID'), deps(store)))
    expect(list.drafts).toHaveLength(3)
    expect(list.decided).toEqual([expect.objectContaining({ id: alerts[3].id, status: 'rejected', decidedByRole: 'Regional officer' })])
    expect(list.audit.map((entry) => entry.action)).toEqual(['alert-rejected', 'alerts-draft'])
  })
})

describe('inbox', () => {
  async function approveAll() {
    const { alerts } = await draft()
    for (const alert of alerts) {
      expect((await handleAlertsApprove(viewPost('/api/alerts-approve', { id: alert.id, approverRole: 'Provincial health officer' }), deps(store))).status).toBe(200)
    }
    return alerts
  }

  it("gives the laptop its municipality's approved alerts, and nothing before approval", async () => {
    await draft()
    expect((await body<InboxResponse>(await inboxAs(laptop))).alerts).toEqual([])
    await approveAll()
    const inbox = await body<InboxResponse>(await inboxAs(laptop))
    expect(inbox.scope).toEqual({ device: 'laptop', municipality: 'SID', barangays: null })
    expect(inbox.alerts).toHaveLength(4)
    expect(inbox.alerts[0]).toMatchObject({ approvedByRole: 'Provincial health officer' })
  })

  it("gives a phone only its own barangay's alerts", async () => {
    await approveAll()
    const kinds = async (barangay: string) =>
      (await body<InboxResponse>(await inboxAs(phones.get(barangay)!))).alerts.map((alert) => `${alert.kind}:${alert.barangay}`).sort()
    expect(await kinds('SID-MAL')).toEqual(['doctor-team:SID-MAL', 'move-stock:SID-BGS', 'watch:SID-MAL'])
    expect(await kinds('SID-BGS')).toEqual(['move-stock:SID-BGS'])
    expect(await kinds('SID-RIV')).toEqual(['watch:SID-RIV'])
    const phone = await body<InboxResponse>(await inboxAs(phones.get('SID-RIV')!))
    expect(phone.scope).toEqual({ device: 'phone', municipality: 'SID', barangays: ['SID-RIV'] })
  })

  it('checks the signature, the time and the nonce like a sync', async () => {
    await approveAll()
    const stranger = await makeDevice()
    expect((await inboxAs(stranger)).status).toBe(401)
    expect((await inboxAs(phones.get('SID-MAL')!, { signer: phones.get('SID-RIV')! })).status).toBe(401)
    const nonce = 'CCCCCCCCCCCCCCCCCCCCCC'
    expect((await inboxAs(phones.get('SID-MAL')!, { nonce })).status).toBe(200)
    expect((await inboxAs(phones.get('SID-MAL')!, { nonce })).status).toBe(409)
    expect((await inboxAs(laptop, { data: { barangay: 'SID-RIV' } })).status).toBe(400)
    const old = new Date(clock - 10 * 60_000)
    const signed = await signEnvelope(laptop.privateKey, laptop.fingerprint, {}, { now: old })
    expect((await handleInbox(post('/api/inbox', signed.body, { [SIGNATURE_HEADER]: signed.signature }), deps(store, {}, new Date(clock)))).status).toBe(401)
  })
})
