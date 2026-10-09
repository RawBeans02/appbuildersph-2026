import { describe, expect, it } from 'vitest'
import { checkDraft, type PlanFacts } from './check'
import { buildMessages, draftTokenBudget, MAX_DRAFT_TOKENS } from './prompt'

const PLAN: PlanFacts = {
  priority: [
    { name: 'Bagong Silang-D', score: { min: 14, max: 20 } },
    { name: 'Riverside-D', score: { min: 8, max: 8 } },
  ],
  moves: [
    { fromName: 'Riverside-D', toName: 'Bagong Silang-D', capsulesUpTo: 30 },
    { fromName: 'West San Roque-D', toName: 'Poblacion Mabuhay-D', capsulesUpTo: '<5' },
  ],
}

const TEMPLATE = [
  'Rule-based action summary for the MHO to review.',
  'Bagong Silang-D has priority score 14–20, followed by Riverside-D with score 8.',
  'The MHO may consider moving up to 30 capsules from Riverside-D to Bagong Silang-D.',
  'The MHO may consider moving up to <5 capsules from West San Roque-D to Poblacion Mabuhay-D.',
  'This plan does not diagnose anyone and sets no dose.',
].join(' ')

const KNOWN = ['Bagong Silang-D', 'Riverside-D', 'West San Roque-D', 'Poblacion Mabuhay-D']

const EXPECTED = [
  'The doctor team for Bagong Silang-D has priority score 14–20.',
  'The doctor team for Riverside-D has priority score 8.',
  'Consider moving from Riverside-D to Bagong Silang-D: up to 30 capsules, for the MHO to decide.',
  'Consider moving from West San Roque-D to Poblacion Mabuhay-D: up to <5 capsules, for the MHO to decide.',
].join('\n')

describe('buildMessages', () => {
  it('shows one placeholder-only copy example, then complete actual sentences without numbered rows or headings', () => {
    const messages = buildMessages(PLAN)

    expect(messages.map(({ role }) => role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(messages[0].content.split(/\s+/).length).toBeLessThan(100)
    expect(messages[1].content).toContain('SAMPLE ONLY')
    expect(messages[1].content).toContain('SAMPLE_PLACE')
    expect(messages[2].content).toContain('SAMPLE_SOURCE to SAMPLE_TARGET')
    expect(messages[2].content).not.toMatch(/\b\d+\b/)
    expect(messages[3].content).toContain(EXPECTED)
    expect(messages[3].content).not.toMatch(/\n\s*\d+\./)
    expect(messages[3].content).not.toContain('priorities, in this exact order')
    expect(messages[3].content).not.toContain('stock-move suggestions')
  })

  it('formats each fact as a concise source-first sentence, preserving ranges and suppressed counts', () => {
    const messages = buildMessages(PLAN)
    const actual = messages[3].content.split('ACTUAL PLAN — copy these complete sentences exactly, in order:\n')[1]

    expect(actual).toBe(EXPECTED)
    expect(checkDraft(actual, TEMPLATE, PLAN, KNOWN)).toEqual({ ok: true })
  })

  it('does not provide a sample for an empty plan', () => {
    const messages = buildMessages({ priority: [], moves: [] })
    expect(messages.map(({ role }) => role)).toEqual(['system', 'user'])
    expect(messages[1].content).toContain('no action sentences are supplied')
  })

  it('keeps generic or unsafe output behind the existing validator', () => {
    const generic = 'Prioritize patients with the greatest needs and allocate resources fairly.'
    const unsafe = `${EXPECTED}\nGive 20 mg daily to residents.`

    expect(checkDraft(generic, TEMPLATE, PLAN, KNOWN).ok).toBe(false)
    expect(checkDraft(unsafe, TEMPLATE, PLAN, KNOWN).ok).toBe(false)
  })
})

describe('draftTokenBudget', () => {
  it('budgets 20 tokens per priority and 40 per move, plus fixed allowance, with a ceiling', () => {
    expect(draftTokenBudget({ priority: [], moves: [] })).toBe(24)
    expect(draftTokenBudget({ priority: [{ name: 'Maligaya-D', score: { min: 9, max: 9 } }], moves: [] })).toBe(44)
    expect(draftTokenBudget({ priority: [], moves: [{ fromName: 'Riverside-D', toName: 'Bagong Silang-D', capsulesUpTo: 30 }] })).toBe(64)
    expect(draftTokenBudget(PLAN)).toBe(144)

    const longPlan: PlanFacts = {
      priority: Array.from({ length: 8 }, (_, index) => ({ name: `Barangay-${index}`, score: { min: index, max: index + 1 } })),
      moves: Array.from({ length: 8 }, (_, index) => ({
        fromName: `Source-${index}`,
        toName: `Target-${index}`,
        capsulesUpTo: index,
      })),
    }
    expect(draftTokenBudget(longPlan)).toBe(MAX_DRAFT_TOKENS)
  })
})
