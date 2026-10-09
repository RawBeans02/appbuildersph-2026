import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closePool, getPool, openStore } from '../db.js'
import { readEnv } from '../env.js'
import {
  handleAlerts,
  handleAlertsApprove,
  handleAlertsDraft,
  handleAlertsReject,
  handleEnroll,
  handleInbox,
  handleSync,
  type Deps,
} from '../handlers.js'
import { phDay } from '../luna/alerts.js'
import { DOXY_CAVEAT, MHO_CONDITION, WATCH_CAVEAT } from '../luna/facts.js'
import type { Fetcher } from '../luna/draft.js'
import {
  SIGNATURE_HEADER,
  signEnvelope,
  VIEW_CODE_HEADER,
  type AlertsResponse,
  type DraftAlertsResponse,
  type ErrorResponse,
  type InboxResponse,
} from '../protocol.js'
import { body, enrollRequest, makeDevice, NOW, post, qrText, syncRequest, type TestDevice } from '../test/fixtures.js'
import { SCENARIO_COUNTS } from '../test/lunaScenario.js'

// Draft → approve → inbox on a real Postgres (CI's postgres:16 container),
// with OpenAI replaced by a stand-in: CI never calls it. The dummy settings
// come from the api job; the AI settings are set here, for these tests only.

const base = readEnv()
if (!base.databaseUrl || !base.enrollCode || !base.viewCode) {
  throw new Error('npm run test:api needs DATABASE_URL, MUNICIPAL_ENROLL_CODE and DOH_VIEW_CODE (see the api job in ci.yml).')
}
const databaseUrl = base.databaseUrl
const viewCode = base.viewCode
const env = { ...base, openaiApiKey: 'ci-dummy-not-a-key', lunaEnabled: true, lunaDailyLimit: 3 }

const requests: string[] = []
// GPT-6 Luna's stand-in: rewords faithfully, except for Riverside-D, where it
// adds a dose (which the check must catch).
const model: Fetcher = async (url, init) => {
  expect(url).toBe('https://api.openai.com/v1/chat/completions')
  const template = JSON.parse(JSON.parse(String(init!.body)).messages[1].content).template as string
  requests.push(template)
  const content = template.includes('Riverside-D') ? `${template} Give one dose to each resident.` : `Advisory: ${template}`
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }))
}

let clock = NOW.getTime()
function realDeps(now = new Date((clock += 1000))): Deps {
  return { env, openStore, now: () => now, ai: { fetch: model, sleep: async () => undefined } }
}

const viewPost = (path: string, data: unknown) => post(path, JSON.stringify(data), { [VIEW_CODE_HEADER]: viewCode })

let laptop: TestDevice
const phones = new Map<string, TestDevice>()

beforeAll(async () => {
  await openStore(databaseUrl)
})

beforeEach(async () => {
  await getPool(databaseUrl).query(
    'TRUNCATE devices, barangay_keys, reports, nonces, rate_limits, audit_log, alerts, luna_usage RESTART IDENTITY CASCADE',
  )
  requests.length = 0
  laptop = await makeDevice()
  expect((await handleEnroll(await enrollRequest(laptop, { code: base.enrollCode! }), realDeps())).status).toBe(200)
  const barangayKeys = []
  const reports = []
  for (const [barangay, counts] of Object.entries(SCENARIO_COUNTS)) {
    const phone = await makeDevice()
    phones.set(barangay, phone)
    barangayKeys.push({ barangay, publicJwk: phone.publicJwk })
    reports.push(await qrText(phone, { barangay, counts }))
  }
  const now = new Date((clock += 1000))
  expect((await handleSync(await syncRequest(laptop, { barangayKeys, reports }, { now }), realDeps(now))).status).toBe(200)
})

afterAll(async () => {
  await closePool()
})

async function inboxAs(device: TestDevice): Promise<InboxResponse> {
  const now = new Date((clock += 1000))
  const signed = await signEnvelope(device.privateKey, device.fingerprint, {}, { now })
  const response = await handleInbox(post('/api/inbox', signed.body, { [SIGNATURE_HEADER]: signed.signature }), realDeps(now))
  expect(response.status).toBe(200)
  return body<InboxResponse>(response)
}

describe('alerts on Postgres', () => {
  it('draft (mocked GPT-6 Luna, daily limit 3) → approve → inbox for the laptop and each phone', async () => {
    const drafted = await body<DraftAlertsResponse>(await handleAlertsDraft(viewPost('/api/alerts-draft', { municipality: 'SID' }), realDeps()))
    expect(drafted.alerts.map((alert) => [alert.kind, alert.barangay])).toEqual([
      ['doctor-team', 'SID-MAL'],
      ['move-stock', 'SID-BGS'],
      ['watch', 'SID-MAL'],
      ['watch', 'SID-RIV'],
    ])
    // Three calls allowed today: one alert falls back to the template for the limit.
    expect(requests).toHaveLength(3)
    expect(drafted.alerts.filter((alert) => alert.aiNote === 'daily-limit')).toHaveLength(1)
    const days = await getPool(databaseUrl).query<{ day: string; calls: number }>("SELECT to_char(day, 'YYYY-MM-DD') AS day, calls FROM luna_usage")
    expect(days.rows).toEqual([{ day: phDay(NOW), calls: 3 }])
    // Riverside-D's reworded text added a dose: kept as the template, with the reason stored.
    const riverside = drafted.alerts.find((alert) => alert.barangay === 'SID-RIV')!
    if (riverside.aiNote !== 'daily-limit') {
      expect(riverside).toMatchObject({ source: 'template', aiNote: 'check-failed' })
      expect(riverside.checkReasons.join(' ')).toMatch(/dose/)
    }
    expect(drafted.alerts.filter((alert) => alert.source === 'luna').every((alert) => alert.text.startsWith('Advisory: '))).toBe(true)

    // An edited wording with a new number is refused; the alert stays a draft.
    const move = drafted.alerts[1]
    const refused = await handleAlertsApprove(
      viewPost('/api/alerts-approve', { id: move.id, approverRole: 'Provincial health officer', text: `${move.text} Also 75 more.` }),
      realDeps(),
    )
    expect(refused.status).toBe(422)
    expect((await body<ErrorResponse>(refused)).reasons?.join(' ')).toMatch(/75/)

    for (const alert of drafted.alerts.slice(0, 3)) {
      const response = await handleAlertsApprove(viewPost('/api/alerts-approve', { id: alert.id, approverRole: 'Provincial health officer' }), realDeps())
      expect(response.status).toBe(200)
    }
    expect((await handleAlertsReject(viewPost('/api/alerts-reject', { id: drafted.alerts[3].id, role: 'Regional officer' }), realDeps())).status).toBe(200)

    const stored = await getPool(databaseUrl).query<{ status: string; approved_by_role: string | null; approved_at: Date | null; decided_by_role: string }>(
      'SELECT status, approved_by_role, approved_at, decided_by_role FROM alerts ORDER BY id',
    )
    expect(stored.rows.map((row) => [row.status, row.approved_by_role, row.approved_at !== null, row.decided_by_role])).toEqual([
      ['approved', 'Provincial health officer', true, 'Provincial health officer'],
      ['approved', 'Provincial health officer', true, 'Provincial health officer'],
      ['approved', 'Provincial health officer', true, 'Provincial health officer'],
      ['rejected', null, false, 'Regional officer'],
    ])

    const laptopInbox = await inboxAs(laptop)
    expect(laptopInbox.scope).toEqual({ device: 'laptop', municipality: 'SID', barangays: null })
    expect(laptopInbox.alerts).toHaveLength(3)
    expect((await inboxAs(phones.get('SID-MAL')!)).alerts.map((alert) => alert.kind).sort()).toEqual(['doctor-team', 'move-stock', 'watch'])
    expect((await inboxAs(phones.get('SID-BGS')!)).alerts.map((alert) => alert.kind)).toEqual(['move-stock'])
    // Riverside-D's only alert was rejected: nothing for its phone.
    expect((await inboxAs(phones.get('SID-RIV')!)).alerts).toEqual([])

    const list = await body<AlertsResponse>(
      await handleAlerts(new Request('https://agapay.test/api/alerts?municipality=SID', { headers: { [VIEW_CODE_HEADER]: viewCode } }), realDeps()),
    )
    expect(list.drafts).toEqual([])
    expect(list.decided).toHaveLength(4)
    expect(list.audit.map((entry) => entry.action)).toEqual(['alert-rejected', 'alert-approved', 'alert-approved', 'alert-approved', 'alerts-draft'])
    expect(list.ai).toMatchObject({ on: false, reason: 'daily-limit' })
  })

  it('stores a reply that left out its caveats WITH them, and appends a caveat an edited approval left out', async () => {
    // This stand-in drops the stock move's condition and its doxycycline line.
    const stripping: Fetcher = async (_url, init) => {
      const template = JSON.parse(JSON.parse(String(init!.body)).messages[1].content).template as string
      const content = template.replace(` ${DOXY_CAVEAT}`, '').replace(`, ${MHO_CONDITION}`, '')
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }))
    }
    const now = new Date((clock += 1000))
    const deps: Deps = { env, openStore, now: () => now, ai: { fetch: stripping, sleep: async () => undefined } }
    const drafted = await body<DraftAlertsResponse>(await handleAlertsDraft(viewPost('/api/alerts-draft', { municipality: 'SID' }), deps))
    const move = drafted.alerts.find((alert) => alert.kind === 'move-stock')!
    expect(move.source).toBe('luna')
    const stored = await getPool(databaseUrl).query<{ text: string }>('SELECT text FROM alerts WHERE id = $1', [move.id])
    expect(stored.rows[0].text).toBe(move.text)
    expect(stored.rows[0].text.endsWith(`\n\nGo ahead only if the municipal health officer agrees. ${DOXY_CAVEAT}`)).toBe(true)

    // Riverside-D's watch alert (the template: the day's 3 calls are used) edited without its referral line.
    const watch = drafted.alerts.find((alert) => alert.barangay === 'SID-RIV')!
    const edited = watch.text.replace(WATCH_CAVEAT, '').trim()
    const approved = await handleAlertsApprove(
      viewPost('/api/alerts-approve', { id: watch.id, approverRole: 'Provincial health officer', text: edited }),
      realDeps(),
    )
    expect(approved.status).toBe(200)
    const row = await getPool(databaseUrl).query<{ text: string; status: string }>('SELECT text, status FROM alerts WHERE id = $1', [watch.id])
    expect(row.rows[0]).toEqual({ text: `${edited}\n\n${WATCH_CAVEAT}`, status: 'approved' })
  })

  it('keeps the alert columns free of anything but codes, facts and roles', async () => {
    const columns = await getPool(databaseUrl).query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'alerts' ORDER BY ordinal_position`,
    )
    expect(columns.rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(['kind', 'audience', 'source', 'template_text', 'check_reasons', 'ai_note', 'decided_by_role', 'decided_at']),
    )
    await expect(
      getPool(databaseUrl).query(`INSERT INTO alerts (municipality, epi_week, text, facts, drafted_by, kind) VALUES ('SID', '2026-W41', 'x', '{}', 'x', 'diagnosis')`),
    ).rejects.toThrow(/check constraint/)
  })
})
