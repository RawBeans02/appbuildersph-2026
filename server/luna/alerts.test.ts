import { beforeEach, describe, expect, it } from 'vitest'
import type { ServerEnv } from '../env.js'
import { HttpError } from '../http.js'
import { createMemoryStore, type MemoryStore } from '../test/memoryStore.js'
import { NOW } from '../test/fixtures.js'
import { scenarioPayloads } from '../test/lunaScenario.js'
import { approveAlert, draftAlerts, listAlerts, phDay, rejectAlert } from './alerts.js'
import type { Fetcher } from './draft.js'

// Drafting, the AI gates and the decisions, on the in-memory store, with
// OpenAI mocked.

const LAPTOP = '3F2A-91C0-7B1E-04D2'
let store: MemoryStore

const ENV: ServerEnv = {
  databaseUrl: 'postgres://unit-test.invalid/agapay',
  enrollCode: 'e',
  viewCode: 'v',
  openaiApiKey: 'test-key-not-real',
  openaiModel: 'gpt-6-luna',
  lunaEnabled: true,
  lunaDailyLimit: 100,
}

beforeEach(async () => {
  store = createMemoryStore()
  for (const payload of scenarioPayloads()) {
    await store.putReport({
      barangay: payload.barangay,
      epiWeek: payload.epiWeek,
      seq: payload.seq,
      municipality: 'SID',
      payload,
      phoneFingerprint: 'AAAA-BBBB-CCCC-DDDD',
      receivedFrom: LAPTOP,
      receivedAt: NOW,
    })
  }
})

// The model's stand-in: answers with `reword(template)` for each request.
function model(reword: (template: string) => string) {
  const requests: string[] = []
  const fetcher: Fetcher = async (_url, init) => {
    const body = JSON.parse(String(init!.body)) as { messages: { content: string }[] }
    const template = JSON.parse(body.messages[1].content).template as string
    requests.push(template)
    return new Response(JSON.stringify({ choices: [{ message: { content: reword(template) } }] }))
  }
  return { fetcher, requests }
}

describe('drafting alerts', () => {
  it('uses GPT-6 Luna wording that passes the check, and the template with the reasons when it fails', async () => {
    const luna = model((template) => (template.includes('Riverside-D') ? `${template} Give 200 mg daily.` : `Update: ${template}`))
    const result = await draftAlerts(store, ENV, 'SID', NOW, { fetch: luna.fetcher })
    expect(luna.requests).toHaveLength(4)
    expect(result.alerts.map((alert) => [alert.kind, alert.barangay, alert.source, alert.status])).toEqual([
      ['doctor-team', 'SID-MAL', 'luna', 'draft'],
      ['move-stock', 'SID-BGS', 'luna', 'draft'],
      ['watch', 'SID-MAL', 'luna', 'draft'],
      ['watch', 'SID-RIV', 'template', 'draft'],
    ])
    const riverside = result.alerts[3]
    expect(riverside.text).toBe(riverside.templateText)
    expect(riverside.aiNote).toBe('check-failed')
    expect(riverside.checkReasons.join(' ')).toMatch(/200|mg/)
    expect(result.alerts[0].text.startsWith('Update: ')).toBe(true)
    expect(result.ai).toMatchObject({ on: true, callsToday: 4, dailyLimit: 100 })
    expect(store.auditLog.at(-1)).toMatchObject({
      action: 'alerts-draft',
      actor: 'doh-view',
      detail: { municipality: 'SID', alerts: 4, luna: 3, template: 1, ai: 'on' },
    })
  })

  it("keeps the template when GPT-6 Luna's reply has characters outside the alphabet or a link", async () => {
    const luna = model((template) =>
      template.includes('Riverside-D')
        ? `${template} Text ０９１７ for help.`
        : template.includes('Bagong Silang-D')
          ? `${template} More at sid-health.ph`
          : template.replace('Maligaya-D', 'Mali\u200Bgaya-D'),
    )
    const result = await draftAlerts(store, ENV, 'SID', NOW, { fetch: luna.fetcher })
    expect(luna.requests).toHaveLength(4)
    for (const alert of result.alerts) {
      expect(alert).toMatchObject({ source: 'template', aiNote: 'check-failed', text: alert.templateText })
    }
    expect(result.alerts.map((alert) => alert.checkReasons.join(' '))).toEqual([
      expect.stringContaining('U+200B'),
      expect.stringContaining('a link'),
      expect.stringContaining('U+200B'),
      expect.stringContaining('U+FF10'),
    ])
  })

  it('kill switch: with LUNA_ENABLED off, templates only and no call', async () => {
    const luna = model((template) => template)
    const result = await draftAlerts(store, { ...ENV, lunaEnabled: false }, 'SID', NOW, { fetch: luna.fetcher })
    expect(luna.requests).toHaveLength(0)
    expect(result.alerts.every((alert) => alert.source === 'template' && alert.aiNote === 'disabled')).toBe(true)
    expect(result.ai).toEqual({ model: 'gpt-6-luna', on: false, reason: 'disabled' })
  })

  it('needs a key and a daily limit before it calls', async () => {
    const luna = model((template) => template)
    expect((await draftAlerts(store, { ...ENV, openaiApiKey: null }, 'SID', NOW, { fetch: luna.fetcher })).ai).toMatchObject({ reason: 'no-key' })
    expect((await draftAlerts(store, { ...ENV, lunaDailyLimit: 0 }, 'SID', NOW, { fetch: luna.fetcher })).ai).toMatchObject({ reason: 'no-limit' })
    expect(luna.requests).toHaveLength(0)
  })

  it('daily limit: past it, the rest are templates, counted per day in the Philippines', async () => {
    const luna = model((template) => template)
    const result = await draftAlerts(store, { ...ENV, lunaDailyLimit: 2 }, 'SID', NOW, { fetch: luna.fetcher })
    expect(luna.requests).toHaveLength(2)
    expect(result.alerts.filter((alert) => alert.source === 'luna')).toHaveLength(2)
    expect(result.alerts.filter((alert) => alert.aiNote === 'daily-limit')).toHaveLength(2)
    expect(store.lunaUsage.get(phDay(NOW))).toBe(2)
    expect(result.ai).toMatchObject({ on: false, reason: 'daily-limit' })
    // A new day (Philippine time) starts again.
    expect(phDay(new Date('2026-10-10T15:59:00Z'))).toBe('2026-10-10')
    expect(phDay(new Date('2026-10-10T16:00:00Z'))).toBe('2026-10-11')
  })

  it('falls back to the template when the model is unreachable', async () => {
    const down: Fetcher = async () => Promise.reject(new TypeError('fetch failed'))
    const result = await draftAlerts(store, ENV, 'SID', NOW, { fetch: down, sleep: async () => undefined })
    expect(result.alerts.every((alert) => alert.source === 'template' && alert.aiNote === 'unreachable')).toBe(true)
  })

  it('drafts nothing without reports', async () => {
    const result = await draftAlerts(createMemoryStore(), ENV, 'SID', NOW, { fetch: model((t) => t).fetcher })
    expect(result.alerts).toEqual([])
  })
})

describe('deciding', () => {
  async function drafts() {
    return (await draftAlerts(store, { ...ENV, lunaEnabled: false }, 'SID', NOW)).alerts
  }

  it('approves with the role and time, and logs it', async () => {
    const [first] = await drafts()
    const later = new Date(NOW.getTime() + 60_000)
    const { alert } = await approveAlert(store, { id: first.id, municipality: 'SID', role: 'Provincial health officer' }, later)
    expect(alert).toMatchObject({ status: 'approved', decidedByRole: 'Provincial health officer', decidedAt: later.toISOString(), text: first.text })
    expect(store.alerts.get(first.id)).toMatchObject({ approvedByRole: 'Provincial health officer', approvedAt: later })
    expect(store.auditLog.at(-1)).toMatchObject({ actor: 'Provincial health officer', action: 'alert-approved', detail: { id: first.id, edited: false } })
    // Once only.
    const again = await approveAlert(store, { id: first.id, municipality: 'SID', role: 'Provincial health officer' }, later).catch((e: unknown) => e)
    expect((again as HttpError).code).toBe('already-decided')
  })

  it('checks an edited wording against the facts again before approving', async () => {
    const [, move] = await drafts()
    const wrong = move.text.replace('up to 30', 'up to 60')
    const refused = await approveAlert(store, { id: move.id, municipality: 'SID', role: 'Regional officer', text: wrong }, NOW).catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(HttpError)
    expect((refused as HttpError).code).toBe('check-failed')
    expect((refused as HttpError).reasons?.join(' ')).toMatch(/60/)
    expect(store.alerts.get(move.id)?.status).toBe('draft')

    const edited = `${move.text} Please confirm by radio.`
    const { alert } = await approveAlert(store, { id: move.id, municipality: 'SID', role: 'Regional officer', text: edited }, NOW)
    expect(alert.text).toBe(edited)
    expect(store.auditLog.at(-1)?.detail).toMatchObject({ edited: true })
  })

  it('refuses an edited wording with look-alike digits or an e-mail address', async () => {
    const [team, move] = await drafts()
    for (const [alert, text] of [
      [move, move.text.replace('up to 30', 'up to ３０')],
      [team, `${team.text} Questions: mho@sid-health.ph`],
    ] as const) {
      const refused = await approveAlert(store, { id: alert.id, municipality: 'SID', role: 'Regional officer', text }, NOW).catch((e: unknown) => e)
      expect((refused as HttpError).code).toBe('check-failed')
      expect(store.alerts.get(alert.id)?.status).toBe('draft')
    }
  })

  it('rejects, logs it, and refuses an alert of another municipality', async () => {
    const [first, second] = await drafts()
    const { alert } = await rejectAlert(store, { id: first.id, municipality: 'SID', role: 'Provincial health officer' }, NOW)
    expect(alert.status).toBe('rejected')
    expect(store.auditLog.at(-1)).toMatchObject({ action: 'alert-rejected', detail: { id: first.id } })
    const other = await rejectAlert(store, { id: second.id, municipality: 'ABC', role: 'Someone else' }, NOW).catch((e: unknown) => e)
    expect((other as HttpError).code).toBe('not-found')
  })

  it('lists drafts, decided alerts and the audit trail', async () => {
    const [first] = await drafts()
    await approveAlert(store, { id: first.id, municipality: 'SID', role: 'Provincial health officer' }, NOW)
    const list = await listAlerts(store, ENV, 'SID', NOW)
    expect(list.drafts).toHaveLength(3)
    expect(list.decided.map((alert) => alert.id)).toEqual([first.id])
    expect(list.audit.map((entry) => entry.action)).toEqual(['alert-approved', 'alerts-draft'])
    expect(list.ai).toMatchObject({ on: true })
  })
})
