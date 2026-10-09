import { describe, expect, it } from 'vitest'
import { checkDraft, numbersIn, PLAN_REMINDER, withPlanNotes, withReminder, withRuleMoves, type PlanFacts } from './check'

const TEMPLATE = `Draft plan for week 2026-W41, San Isidro Demo (SID)
Doctor teams, in priority order (unahin ang nasa itaas):
1. Maligaya-D: score 14–20 = <5 urgent referrals ×3 (3–12) + 12 residents in the watch window ×1 (12)
2. Riverside-D: score 9 = 9 residents in the watch window ×1 (9)
Doxycycline stock moves, for the MHO to decide:
- Riverside-D to Maligaya-D: up to 30 capsules that expire within 6 weeks.
Paalala: counts only, no names. "<5" means 1 to 4. The watch window is day 5 to 15 after floodwater contact. This plan does not diagnose anyone and sets no dose; doxycycline only after consultation with a health professional.`

const PLAN: PlanFacts = {
  priority: [
    { name: 'Maligaya-D', score: { min: 14, max: 20 } },
    { name: 'Riverside-D', score: { min: 9, max: 9 } },
  ],
  moves: [{ fromName: 'Riverside-D', toName: 'Maligaya-D', capsulesUpTo: 30 }],
}
const KNOWN = ['Maligaya-D', 'Bagong Silang-D', 'Riverside-D', 'Mabini-D', 'Santo Niño-D']

const GOOD = `For week 2026-W41: send the first doctor team to Maligaya-D (score 14–20, with <5 urgent referrals and 12 residents in the watch window), then Riverside-D (score 9). Consider moving up to 30 doxycycline capsules that expire within 6 weeks from Riverside-D to Maligaya-D, if the MHO approves. This plan does not diagnose anyone and sets no dose.`

const check = (draft: string) => checkDraft(draft, TEMPLATE, PLAN, KNOWN)
const reasons = (draft: string) => {
  const result = check(draft)
  return result.ok ? [] : result.reasons
}

describe('numbersIn', () => {
  it('reads digits, number words, and "<5" as its own token', () => {
    expect(numbersIn('score 14–20, <5, week 2026-W41, twelve residents, lima, seventy')).toEqual(['<5', 14, 20, 2026, 41, 12, 5, 70])
  })
})

describe('checkDraft', () => {
  it('accepts a faithful rewording', () => {
    expect(check(GOOD)).toEqual({ ok: true })
  })

  it('rejects a changed or added number, digits or words', () => {
    expect(reasons(GOOD.replace('up to 30', 'up to 35'))).toContain('It adds numbers that are not in the plan: 35.')
    expect(reasons(`${GOOD} Send seventy nurses.`)).toContain('It adds numbers that are not in the plan: 70.')
  })

  it("rejects the plan's own numbers on the wrong move", () => {
    // 12 is a number of the plan, but not this move's amount.
    expect(reasons(GOOD.replace('up to 30 doxycycline', 'up to 12 doxycycline'))).toContain(
      'It changes or leaves out the move of up to 30 capsules from Riverside-D to Maligaya-D.',
    )
  })

  it('rejects a reversed move, and a move the plan does not make', () => {
    const reversed = GOOD.replace('from Riverside-D to Maligaya-D', 'from Maligaya-D to Riverside-D')
    expect(reasons(reversed)).toEqual(
      expect.arrayContaining([
        'It changes or leaves out the move of up to 30 capsules from Riverside-D to Maligaya-D.',
        "It suggests a move from Maligaya-D to Riverside-D that the plan doesn't make.",
      ]),
    )
    expect(reasons(`${GOOD} Also move 9 capsules from Riverside-D to Bagong Silang-D.`)).toEqual(
      expect.arrayContaining([
        'It names barangays that are not in the plan: Bagong Silang-D.',
        "It suggests a move from Riverside-D to Bagong Silang-D that the plan doesn't make.",
      ]),
    )
  })

  it('needs each priority barangay with its own score, in order', () => {
    expect(reasons(GOOD.replace(' (score 9)', ''))).toContain("It doesn't give Riverside-D's score (9) next to its name.")
    const swapped = 'Visit Riverside-D first (score 9), then Maligaya-D (score 14–20). Move up to 30 capsules that expire within 6 weeks from Riverside-D to Maligaya-D.'
    expect(reasons(swapped)).toContain('It changes the doctor-team priority order.')
    expect(reasons(GOOD.replaceAll('Riverside-D', 'the other barangay'))).toContain('It leaves out Riverside-D.')
  })

  it('treats "<5" as its own token, never as an allowed 5', () => {
    const plain = TEMPLATE.replaceAll('<5', 'few')
    const result = checkDraft(GOOD, plain, PLAN, KNOWN)
    expect(result.ok ? [] : result.reasons).toContain('It adds a "<5" that is not in the plan.')
  })

  it('rejects any dose, amount per person, schedule or diagnosis beyond the reminder', () => {
    for (const added of [
      'Give 2 capsules per person.',
      'Each resident should take doxycycline.',
      'Give capsules to every exposed resident.',
      'Bigyan ang bawat tao.',
      'A dose of doxycycline weekly is advised.',
      'Use 100 mg tablets.',
      'Give it daily to the exposed.',
      'Residents in Maligaya-D are diagnosed with leptospirosis.',
    ]) {
      expect(check(`${GOOD} ${added}`).ok, added).toBe(false)
    }
  })

  it('rejects an empty draft', () => {
    expect(check('  ').ok).toBe(false)
  })
})

describe('withReminder', () => {
  it('adds the fixed no-dose, no-diagnosis reminder once', () => {
    expect(withReminder('A plan.')).toBe(`A plan.\n\n${PLAN_REMINDER}`)
    expect(withReminder(withReminder('A plan.'))).toBe(`A plan.\n\n${PLAN_REMINDER}`)
  })
})

describe('a stock move stays the MHO\'s decision', () => {
  it('accepts "for the MHO to decide" and "if the MHO approves", refuses a bare order', () => {
    expect(reasons(GOOD)).toEqual([])
    const copied = GOOD.replace(
      'Consider moving up to 30 doxycycline capsules that expire within 6 weeks from Riverside-D to Maligaya-D, if the MHO approves.',
      'Consider moving from Riverside-D to Maligaya-D: up to 30 capsules, for the MHO to decide.',
    )
    expect(reasons(copied)).toEqual([])
    const order = GOOD.replace(
      'Consider moving up to 30 doxycycline capsules that expire within 6 weeks from Riverside-D to Maligaya-D, if the MHO approves.',
      'Move up to 30 capsules from Riverside-D to Maligaya-D.',
    )
    expect(reasons(order)).toEqual([
      'It turns the move of up to 30 capsules from Riverside-D to Maligaya-D into an order; keep "for the MHO to decide".',
    ])
  })
})

describe('withPlanNotes', () => {
  const template = [
    'Doxycycline stock moves, for the MHO to decide (ilipat lamang kung aprubado):',
    'No stock move suggested: no barangay has capsules expiring within 6 weeks.',
    '',
    'Batayan (based on): Maligaya-D export 4 (2026-W41); Riverside-D export 2 (2026-W40, sample data).',
    'Older week: Riverside-D last sent week 2026-W40.',
    'Paalala: counts only, no names. "<5" means 1 to 4, so scores and totals that include one are ranges.',
  ].join('\n')
  it('adds the rule notes a short summary leaves out, once', () => {
    const noted = withPlanNotes('The doctor team for Maligaya-D has priority score 14–20.', template)
    expect(noted).toBe(
      [
        'The doctor team for Maligaya-D has priority score 14–20.',
        '',
        'No stock move suggested: no barangay has capsules expiring within 6 weeks.',
        'Batayan (based on): Maligaya-D export 4 (2026-W41); Riverside-D export 2 (2026-W40, sample data).',
        'Older week: Riverside-D last sent week 2026-W40.',
        '"<5" means 1 to 4, so scores and totals that include one are ranges.',
      ].join('\n'),
    )
    expect(withPlanNotes(noted, template)).toBe(noted)
  })
  it('adds nothing when the template has no notes', () => {
    expect(withPlanNotes('A plan.', 'Doctor teams:')).toBe('A plan.')
  })
})

describe('the prompt\'s sample scaffolding', () => {
  it('refuses a draft that echoes the SAMPLE placeholders or the ACTUAL PLAN header', () => {
    expect(reasons(`${GOOD} The doctor team for SAMPLE_PLACE has priority score SAMPLE_SCORE.`)).toContain(
      'It copies the sample from the instructions instead of the plan.',
    )
    expect(reasons(`ACTUAL PLAN: ${GOOD}`)).toContain('It copies the sample from the instructions instead of the plan.')
  })
})

describe('stock moves the check must not let through (Codex review)', () => {
  const MOVE = 'Consider moving up to 30 doxycycline capsules that expire within 6 weeks from Riverside-D to Maligaya-D, if the MHO approves.'
  it('refuses a reversed move worded "to {from} from {to}"', () => {
    const reversed = GOOD.replace(MOVE, 'Move 30 capsules to Riverside-D from Maligaya-D, for the MHO to decide.')
    expect(reasons(reversed)).toContain('It reverses the move from Riverside-D to Maligaya-D.')
  })
  it('refuses a move sentence that carries a second amount', () => {
    const inflated = GOOD.replace(MOVE, 'Move 9 capsules from Riverside-D to Maligaya-D for the MHO to decide; the plan said 30.')
    expect(reasons(inflated)).toContain('It adds 9 to the move of up to 30 capsules from Riverside-D to Maligaya-D.')
  })
})

describe('withRuleMoves', () => {
  const template = [
    'Doctor teams, in priority order:',
    '1. Maligaya-D: score 14–20',
    '',
    'Doxycycline stock moves, for the MHO to decide (ilipat lamang kung aprubado):',
    '- Riverside-D to Maligaya-D: up to 30 capsules that expire within 6 weeks.',
    '',
    'Paalala: counts only.',
  ].join('\n')
  it("replaces the model's move sentences with the rules' move lines", () => {
    const used = withRuleMoves('Send the first doctor team to Maligaya-D. Move 30 capsules to Riverside-D from Maligaya-D.', template)
    expect(used).toBe(
      [
        'Send the first doctor team to Maligaya-D.',
        '',
        'Doxycycline stock moves, for the MHO to decide (ilipat lamang kung aprubado):',
        '- Riverside-D to Maligaya-D: up to 30 capsules that expire within 6 weeks.',
      ].join('\n'),
    )
  })
  it('leaves a draft alone when the template has no move section', () => {
    expect(withRuleMoves('A plan.', 'Doctor teams:')).toBe('A plan.')
  })
})
