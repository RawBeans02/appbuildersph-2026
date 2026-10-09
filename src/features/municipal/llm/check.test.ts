import { describe, expect, it } from 'vitest'
import { checkDraft, numbersIn } from './check'

const TEMPLATE = `Draft plan for week 2026-W41, San Isidro Demo (SID)
Doctor teams, in priority order (unahin ang nasa itaas):
1. Maligaya-D: score 14–20 = <5 urgent referrals ×3 (3–12) + 12 residents in the watch window ×1 (12)
2. Riverside-D: score 9 = 9 residents in the watch window ×1 (9)
Doxycycline stock moves, for the MHO to decide:
- Riverside-D to Maligaya-D: up to 30 capsules that expire within 6 weeks.
Paalala: counts only, no names. "<5" means 1 to 4. The watch window is day 5 to 15 after floodwater contact. This plan does not diagnose anyone and sets no dose; doxycycline only after consultation with a health professional.`

const names = { priority: ['Maligaya-D', 'Riverside-D'], known: ['Maligaya-D', 'Bagong Silang-D', 'Riverside-D', 'Mabini-D'] }

const GOOD = `For week 2026-W41: send the first doctor team to Maligaya-D (score 14–20, with <5 urgent referrals and 12 residents in the watch window), then Riverside-D (score 9). Consider moving up to 30 doxycycline capsules that expire within 6 weeks from Riverside-D to Maligaya-D, if the MHO approves. Reminder: counts only; this plan does not diagnose anyone and sets no dose.`

describe('numbersIn', () => {
  it('reads digits, ranges and number words', () => {
    expect(numbersIn('score 14–20, <5, week 2026-W41, twelve residents, lima')).toEqual([14, 20, 5, 2026, 41, 12, 5])
  })
})

describe('checkDraft', () => {
  it('accepts a faithful rewording', () => {
    expect(checkDraft(GOOD, TEMPLATE, names)).toEqual({ ok: true })
  })

  it('rejects a changed or added number, digits or words', () => {
    expect(checkDraft(GOOD.replace('up to 30', 'up to 35'), TEMPLATE, names)).toMatchObject({
      ok: false,
      reasons: ['It adds numbers that are not in the plan: 35.'],
    })
    expect(checkDraft(`${GOOD} Send seventeen nurses.`, TEMPLATE, names)).toMatchObject({ ok: false })
  })

  it('rejects any dose, amount per person, schedule or diagnosis beyond the reminder', () => {
    const cases = [
      'Give 2 capsules per person.',
      'Each resident should take doxycycline.',
      'A dose of doxycycline weekly is advised.',
      'Use 100 mg tablets.',
      'Give it daily to the exposed.',
      'Residents in Maligaya-D are diagnosed with leptospirosis.',
    ]
    for (const added of cases) {
      const result = checkDraft(`${GOOD} ${added}`, TEMPLATE, names)
      expect(result.ok, added).toBe(false)
    }
  })

  it('rejects a barangay the plan does not name, a missing one, or a new priority order', () => {
    expect(checkDraft(`${GOOD} Also check Mabini-D.`, TEMPLATE, names)).toMatchObject({
      ok: false,
      reasons: ['It names barangays that are not in the plan: Mabini-D.'],
    })
    expect(checkDraft(GOOD.replaceAll('Riverside-D', 'the other barangay'), TEMPLATE, names)).toMatchObject({
      ok: false,
      reasons: ['It leaves out Riverside-D.'],
    })
    const swapped = 'Visit Riverside-D first, then Maligaya-D, with the scores 9 and 14–20 from the plan for week 2026-W41.'
    expect(checkDraft(swapped, TEMPLATE, names)).toMatchObject({
      ok: false,
      reasons: ['It changes the doctor-team priority order.'],
    })
  })

  it('rejects an empty draft', () => {
    expect(checkDraft('  ', TEMPLATE, names).ok).toBe(false)
  })
})
