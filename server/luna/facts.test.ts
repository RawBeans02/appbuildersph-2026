import { describe, expect, it } from 'vitest'
import { scenarioPayloads } from '../test/lunaScenario.js'
import { checkAlertText, LINK_REASON } from './check.js'
import {
  alertCandidates,
  DOCTOR_TEAM_CAVEAT,
  DOXY_CAVEAT,
  MAX_ALERTS,
  MHO_CONDITION,
  WATCH_CAVEAT,
  withCaveats,
  type AlertCandidate,
} from './facts.js'

const candidates = alertCandidates(scenarioPayloads())
const byKind = (kind: AlertCandidate['kind'], barangay?: string) =>
  candidates.find((candidate) => candidate.kind === kind && (barangay === undefined || candidate.barangay === barangay))!

describe('alert facts', () => {
  it('follow the plan rules: doctor team first, the stock move, then watch alerts', () => {
    expect(candidates.map((candidate) => [candidate.kind, candidate.barangay, candidate.audience])).toEqual([
      ['doctor-team', 'SID-MAL', ['SID-MAL']],
      ['move-stock', 'SID-BGS', ['SID-BGS', 'SID-MAL']],
      ['watch', 'SID-MAL', ['SID-MAL']],
      ['watch', 'SID-RIV', ['SID-RIV']],
    ])
    // Urgent "<5" ×3 (3–12) + fast-breathing 6 ×2 + 12 in the window: a range, as on the laptop.
    expect(byKind('doctor-team').facts).toMatchObject({ score: { min: 27, max: 36 }, urgentReferrals: '<5', inWatchWindow: 12 })
    expect(byKind('move-stock').facts).toMatchObject({ from: 'SID-BGS', to: 'SID-MAL', capsulesUpTo: 30, toOnHand: 10 })
  })

  it('are deterministic: same reports in any order, same alerts and wording', () => {
    expect(alertCandidates(scenarioPayloads())).toEqual(candidates)
    expect(alertCandidates([...scenarioPayloads()].reverse())).toEqual(candidates)
    expect(JSON.stringify(alertCandidates(scenarioPayloads()))).toBe(JSON.stringify(candidates))
  })

  it('hold only codes, demo names, the week, counts and ranges', () => {
    for (const candidate of candidates) {
      const values = JSON.stringify(candidate.facts).match(/"[^"]*"/g) ?? []
      for (const value of values) {
        expect(value).toMatch(/^"(?:[a-zA-Z]+|SID|SID-[A-Z]{3}|2026-W\d\d|<5|[A-Z][a-z]+(?: [A-Z][a-z]+)?-D|doctor-team|move-stock)"$/)
      }
    }
  })

  it('write the template from the facts alone', () => {
    expect(byKind('doctor-team').templateText).toBe(
      'Send a doctor team to Maligaya-D first this week (2026-W41). Maligaya-D has the highest priority score, 27–36: ' +
        '<5 urgent danger-sign referrals ×3, 6 fast-breathing referrals ×2 and 12 residents in the leptospirosis watch window ×1. ' +
        'The score ranks barangays by screening counts only; the doctor team decides who needs care.',
    )
    expect(byKind('move-stock').templateText).toContain('Move up to 30 doxycycline capsules that expire within 6 weeks from Bagong Silang-D to Maligaya-D')
    expect(byKind('watch', 'SID-RIV').templateText).toContain('Riverside-D has 7 residents in the leptospirosis watch window this week (2026-W41)')
  })

  it("carry each kind's fixed safety caveats, which withCaveats puts back when a wording leaves them out", () => {
    const move = byKind('move-stock')
    expect(move.templateText).toContain(`to Maligaya-D, ${MHO_CONDITION}.`)
    expect(move.templateText.endsWith(DOXY_CAVEAT)).toBe(true)
    expect(byKind('doctor-team').templateText.endsWith(DOCTOR_TEAM_CAVEAT)).toBe(true)
    expect(byKind('watch', 'SID-RIV').templateText.endsWith(WATCH_CAVEAT)).toBe(true)
    // Every template already has its caveats: unchanged.
    for (const candidate of candidates) expect(withCaveats(candidate.templateText, candidate.kind)).toBe(candidate.templateText)

    const bare = 'Move up to 30 doxycycline capsules expiring within 6 weeks from Bagong Silang-D to Maligaya-D.'
    const kept = withCaveats(bare, 'move-stock')
    expect(kept).toBe(`${bare}\n\nGo ahead only if the municipal health officer agrees. ${DOXY_CAVEAT}`)
    expect(withCaveats(kept, 'move-stock')).toBe(kept)
    // Case and spacing aside, a caveat that's there isn't added twice.
    expect(withCaveats(`If the municipal  health officer agrees, ${bare.toLowerCase()} ${DOXY_CAVEAT.toUpperCase()}`, 'move-stock')).not.toContain('\n')
    expect(withCaveats('Maligaya-D first.', 'doctor-team')).toBe(`Maligaya-D first.\n\n${DOCTOR_TEAM_CAVEAT}`)
    expect(withCaveats('Riverside-D: keep watching.', 'watch')).toBe(`Riverside-D: keep watching.\n\n${WATCH_CAVEAT}`)
    // Each kind's caveats pass the check, appended to a faithful rewording.
    expect(checkAlertText(kept, move)).toEqual({ ok: true })
  })

  it('give nothing when there are no reports, and at most MAX_ALERTS', () => {
    expect(alertCandidates([])).toEqual([])
    expect(candidates.length).toBeLessThanOrEqual(MAX_ALERTS)
  })
})

describe('the wording check (the laptop panel’s positional check)', () => {
  it('passes every template against its own facts', () => {
    for (const candidate of candidates) expect(checkAlertText(candidate.templateText, candidate)).toEqual({ ok: true })
  })

  it('passes a faithful rewording', () => {
    const move = byKind('move-stock')
    const text =
      'If the municipal health officer agrees, move up to 30 doxycycline capsules expiring within 6 weeks from Bagong Silang-D to Maligaya-D. ' +
      'Doxycycline is given only after consultation with a health professional.'
    expect(checkAlertText(text, move)).toEqual({ ok: true })
    const team = byKind('doctor-team')
    expect(checkAlertText('Maligaya-D comes first for a doctor team in 2026-W41: priority score 27–36, from <5 urgent referrals, 6 fast-breathing referrals and 12 people in the watch window.', team)).toEqual({ ok: true })
  })

  const rejects = (text: string, candidate: AlertCandidate) => {
    const result = checkAlertText(text, candidate)
    expect(result.ok).toBe(false)
    return result.ok ? [] : result.reasons
  }

  it('rejects a changed or extra number', () => {
    const team = byKind('doctor-team')
    expect(rejects(team.templateText.replace('27–36', '27–37'), team).join(' ')).toMatch(/numbers that are not in the plan: 37/)
    expect(rejects(`${team.templateText} About 40 more people may follow.`, team).join(' ')).toMatch(/40/)
    const watch = byKind('watch', 'SID-RIV')
    expect(rejects(watch.templateText.replace('has 7 residents', 'has 12 residents'), watch).join(' ')).toMatch(/score|12/)
  })

  it('rejects a dose, a schedule or a diagnosis', () => {
    const move = byKind('move-stock')
    expect(rejects(`${move.templateText} Give each exposed person one dose.`, move).join(' ')).toMatch(/dose|per person/)
    expect(rejects(`${move.templateText} Take it once a day.`, move).join(' ')).toMatch(/schedule|take medicine/)
    const watch = byKind('watch', 'SID-MAL')
    expect(rejects(`${watch.templateText} This is a leptospirosis diagnosis.`, watch).join(' ')).toMatch(/diagnosis/)
  })

  it('rejects a new barangay or a different stock move', () => {
    const watch = byKind('watch', 'SID-RIV')
    expect(rejects(`${watch.templateText} Mabini-D should also prepare.`, watch).join(' ')).toMatch(/Mabini-D/)
    const move = byKind('move-stock')
    const flipped = move.templateText.replace('from Bagong Silang-D to Maligaya-D', 'from Maligaya-D to Bagong Silang-D')
    expect(rejects(flipped, move).length).toBeGreaterThan(0)
  })

  it('rejects a link and an overlong text', () => {
    const team = byKind('doctor-team')
    expect(rejects(`${team.templateText} See https://example.com`, team)).toEqual([LINK_REASON])
    expect(rejects(team.templateText.repeat(5), team).join(' ')).toMatch(/longer than/)
  })
})
