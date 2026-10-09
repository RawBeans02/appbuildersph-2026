import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AlertView } from '../../../server/protocol'
import { DraftCard } from './AlertsPanel'
import { problemText } from '../municipal/sync/client'
import { aiLine, alertsApi, auditLine, factRows, isRole, sourceLine } from './alerts'

// The alerts panel's words, from synthetic alerts.

const MOVE: AlertView = {
  id: '7',
  kind: 'move-stock',
  municipality: 'SID',
  barangay: 'SID-BGS',
  audience: ['SID-BGS', 'SID-MAL'],
  epiWeek: '2026-W41',
  text: 'Move up to 30 doxycycline capsules that expire within 6 weeks from Bagong Silang-D to Maligaya-D.',
  templateText: 'Move up to 30 doxycycline capsules that expire within 6 weeks from Bagong Silang-D to Maligaya-D.',
  facts: {
    kind: 'move-stock',
    from: 'SID-BGS',
    to: 'SID-MAL',
    capsulesUpTo: 30,
    fromInWatchWindow: 0,
    fromOnHand: 80,
    toInWatchWindow: 12,
    toOnHand: '<5',
  },
  source: 'luna',
  checkReasons: [],
  aiNote: null,
  status: 'draft',
  createdAt: '2026-10-10T01:00:00.000Z',
  decidedByRole: null,
  decidedAt: null,
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim()

describe('alerts panel words', () => {
  it('says whether GPT-6 Luna is on, and why not', () => {
    expect(aiLine({ model: 'gpt-6-luna', on: true, callsToday: 4, dailyLimit: 50 })).toEqual({ on: true, text: 'GPT-6 Luna: on · 4 of 50 calls today' })
    expect(aiLine({ model: 'gpt-6-luna', on: false, reason: 'disabled' }).text).toBe('AI off: switched off. Alerts use their template wording.')
    expect(aiLine({ model: 'gpt-6-luna', on: false, reason: 'daily-limit' }).text).toMatch(/limit is used up/)
    expect(aiLine(null)).toEqual({ on: false, text: "AI off: the server can't be reached. Alerts need the server." })
  })

  it('tags the source honestly, never "all numbers match"', () => {
    const luna = sourceLine(MOVE)
    expect(luna.tag).toBe('Written by GPT-6 Luna')
    expect(luna.line).toMatch(/Check each number against the facts/)
    const failed = sourceLine({ source: 'template', aiNote: 'check-failed', checkReasons: ['It adds numbers that are not in the plan: 60.'] })
    expect(failed).toEqual({ tag: 'Template', line: "GPT-6 Luna's wording didn't pass the check, so the template is shown: It adds numbers that are not in the plan: 60." })
    expect(sourceLine({ source: 'template', aiNote: 'disabled', checkReasons: [] }).line).toBe('AI off: the wording comes from the facts only.')
    for (const line of [luna.line, failed.line]) expect(line).not.toMatch(/all numbers match/i)
  })

  it('tags an officer-edited wording "Edited by the officer", never GPT-6 Luna', () => {
    const edited = sourceLine({ source: 'edited', aiNote: null, checkReasons: [] })
    expect(edited.tag).toBe('Edited by the officer')
    expect(`${edited.tag} ${edited.line}`).not.toMatch(/Written by GPT-6 Luna/)
    expect(edited.line).toMatch(/checked again/)
  })

  it('says when a newer draft replaced the alert', async () => {
    const superseded = async () => new Response(JSON.stringify({ ok: false, error: 'superseded', message: 'x' }), { status: 409 })
    const result = await alertsApi.reject('code', 'SID', '7', 'Regional officer', superseded)
    expect(result).toEqual({ ok: false, problem: { kind: 'superseded' } })
    if (!result.ok) expect(problemText(result.problem).title).toBe('A newer draft replaced this alert')
  })

  it('lists the facts as shown, "<5" kept', () => {
    expect(factRows(MOVE)).toEqual([
      ['From', 'Bagong Silang-D'],
      ['To', 'Maligaya-D'],
      ['Capsules expiring in 6 weeks (up to)', '30'],
      ['From: in watch window', '0'],
      ['From: capsules on hand', '80'],
      ['To: in watch window', '12'],
      ['To: capsules on hand', '<5'],
      ['Week', '2026-W41'],
    ])
    expect(factRows({ kind: 'doctor-team', epiWeek: '2026-W41', facts: { barangay: 'SID-MAL', score: { min: 27, max: 36 }, urgentReferrals: '<5', fastBreathing: { min: 6, max: 6 }, inWatchWindow: 12 } })[1]).toEqual([
      'Priority score',
      '27–36',
    ])
  })

  it('takes a role, not a name with numbers or markup', () => {
    expect(isRole('Provincial health officer')).toBe(true)
    expect(isRole("Officer-in-charge, RHU")).toBe(false)
    expect(isRole('Dr. 12')).toBe(false)
  })

  it('writes the audit trail by role and action', () => {
    const now = new Date('2026-10-10T02:00:00.000Z')
    expect(
      auditLine({ at: '2026-10-10T01:00:00.000Z', actor: 'Provincial health officer', action: 'alert-approved', detail: { id: '7', kind: 'move-stock', edited: true } }, now),
    ).toMatch(/Provincial health officer approved #7 \(Stock move\), edited$/)
    expect(auditLine({ at: '2026-10-10T01:00:00.000Z', actor: 'doh-view', action: 'alerts-draft', detail: { luna: 3, template: 1 } }, now)).toMatch(
      /drafted 4 alerts \(3 by GPT-6 Luna, 1 from the template\)$/,
    )
  })

  it('renders a draft with its facts, its source and its check line, and Approve waits for a role', () => {
    const html = renderToStaticMarkup(createElement(DraftCard, { alert: MOVE, code: 'x', municipality: 'SID', role: '', onDone: () => undefined }))
    const shown = text(html)
    expect(shown).toContain('Stock move · Bagong Silang-D')
    expect(shown).toContain('Written by GPT-6 Luna')
    expect(shown).toContain('To: capsules on hand <5')
    expect(shown).toContain('Type your role above to decide.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Approve/)
  })
})
