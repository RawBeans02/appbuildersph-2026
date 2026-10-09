import { formatCount, formatRange } from '../src/qr/index.js'
import { checkDraft, type DraftCheck, type PlanFacts } from '../src/features/municipal/llm/check'
import { buildMessages, draftTokenBudget, type ChatMessage } from '../src/features/municipal/llm/prompt'

export type LlmQualityFixture = {
  id: string
  scenario: string
  plan: PlanFacts
  knownNames: readonly string[]
  template: string
  messages: ChatMessage[]
  maxTokens: number
}

// Synthetic labels deliberately include common spacing, hyphen, capitalization,
// and diacritic variations without referring to real patient or household data.
const KNOWN_NAMES = [
  'Maligaya-D',
  'Bagong Silang-D',
  'Santo Niño-D',
  'Mabini-D',
  'Riverside-D',
  'San Isidro Norte-D',
  'Santa Cruz Este-D',
  'Barangay Luntian-D',
  'Poblacion Mabuhay-D',
  'West San Roque-D',
  'East San Roque-D',
] as const

function safeTemplate(plan: PlanFacts): string {
  const priorities = plan.priority.length
    ? plan.priority.map((row) => `${row.name}: doctor-team priority score ${formatRange(row.score)}.`).join(' ')
    : 'No doctor-team priority is listed.'
  const moves = plan.moves.length
    ? plan.moves
        .map(
          (move) =>
            `The MHO may consider moving up to ${formatCount(move.capsulesUpTo)} capsules from ${move.fromName} to ${move.toName}; this is a suggestion.`,
        )
        .join(' ')
    : 'No stock move is listed.'
  return `Rule-based action summary for the MHO to review. ${priorities} ${moves} This plan does not diagnose anyone and sets no dose.`
}

const definitions: readonly { id: string; scenario: string; plan: PlanFacts }[] = [
  {
    id: 'no-actions',
    scenario: 'zero priorities and zero moves',
    plan: { priority: [], moves: [] },
  },
  {
    id: 'one-priority-single-score',
    scenario: 'one priority with one exact score',
    plan: { priority: [{ name: 'Maligaya-D', score: { min: 9, max: 9 } }], moves: [] },
  },
  {
    id: 'one-priority-suppressed-range',
    scenario: 'one priority with a suppressed 1–4 score range',
    plan: { priority: [{ name: 'San Isidro Norte-D', score: { min: 1, max: 4 } }], moves: [] },
  },
  {
    id: 'two-priorities-equal-score-alphabetical',
    scenario: 'two equal-score priorities in alphabetical order, including an accented name',
    plan: {
      priority: [
        { name: 'Santa Cruz Este-D', score: { min: 12, max: 12 } },
        { name: 'Santo Niño-D', score: { min: 12, max: 12 } },
      ],
      moves: [],
    },
  },
  {
    id: 'three-priorities-name-variation',
    scenario: 'three ordered priorities with multiword and accented names',
    plan: {
      priority: [
        { name: 'Riverside-D', score: { min: 18, max: 22 } },
        { name: 'Barangay Luntian-D', score: { min: 11, max: 11 } },
        { name: 'Santo Niño-D', score: { min: 6, max: 9 } },
      ],
      moves: [],
    },
  },
  {
    id: 'one-priority-one-move',
    scenario: 'one priority and one exact stock-move suggestion',
    plan: {
      priority: [{ name: 'Maligaya-D', score: { min: 12, max: 12 } }],
      moves: [{ fromName: 'Mabini-D', toName: 'Maligaya-D', capsulesUpTo: 30 }],
    },
  },
  {
    id: 'two-priorities-one-move',
    scenario: 'two ordered priorities and a move from one to the other',
    plan: {
      priority: [
        { name: 'Bagong Silang-D', score: { min: 14, max: 20 } },
        { name: 'Riverside-D', score: { min: 8, max: 8 } },
      ],
      moves: [{ fromName: 'Riverside-D', toName: 'Bagong Silang-D', capsulesUpTo: 30 }],
    },
  },
  {
    id: 'one-priority-two-moves',
    scenario: 'one priority and two ordered move suggestions',
    plan: {
      priority: [{ name: 'Poblacion Mabuhay-D', score: { min: 1, max: 4 } }],
      moves: [
        { fromName: 'East San Roque-D', toName: 'Poblacion Mabuhay-D', capsulesUpTo: 20 },
        { fromName: 'West San Roque-D', toName: 'Poblacion Mabuhay-D', capsulesUpTo: '<5' },
      ],
    },
  },
  {
    id: 'three-priorities-two-moves',
    scenario: 'three ordered priorities and two moves',
    plan: {
      priority: [
        { name: 'Santa Cruz Este-D', score: { min: 20, max: 24 } },
        { name: 'Maligaya-D', score: { min: 13, max: 13 } },
        { name: 'Santo Niño-D', score: { min: 6, max: 9 } },
      ],
      moves: [
        { fromName: 'Riverside-D', toName: 'Maligaya-D', capsulesUpTo: 30 },
        { fromName: 'Mabini-D', toName: 'Santo Niño-D', capsulesUpTo: 15 },
      ],
    },
  },
  {
    id: 'suppressed-priority-and-move',
    scenario: 'suppressed score range, second priority, and a <5 move amount',
    plan: {
      priority: [
        { name: 'San Isidro Norte-D', score: { min: 1, max: 4 } },
        { name: 'Barangay Luntian-D', score: { min: 8, max: 11 } },
      ],
      moves: [{ fromName: 'East San Roque-D', toName: 'Barangay Luntian-D', capsulesUpTo: '<5' }],
    },
  },
]

export const LLM_QUALITY_MIN_ACCEPTED = 8

export const LLM_QUALITY_FIXTURES: readonly LlmQualityFixture[] = definitions.map(({ id, scenario, plan }) => ({
  id,
  scenario,
  plan,
  knownNames: KNOWN_NAMES,
  template: safeTemplate(plan),
  messages: buildMessages(plan),
  maxTokens: draftTokenBudget(plan),
}))

export function checkLlmQualityDraft(fixture: LlmQualityFixture, draft: string): DraftCheck {
  return checkDraft(draft, fixture.template, fixture.plan, fixture.knownNames)
}
