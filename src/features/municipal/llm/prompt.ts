// The local model copies concise action sentences generated from rule-based
// facts. It does not calculate scores, choose moves, or approve a plan.

import { formatCount, formatRange } from '../../../qr/index.js'
import type { PlanFacts } from './check'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

// Give each required line room to copy, with a fixed ceiling for long plans.
export const MAX_DRAFT_TOKENS = 224
const TOKENS_PER_PRIORITY = 20
const TOKENS_PER_MOVE = 40
const FIXED_TOKEN_ALLOWANCE = 24

export function draftTokenBudget(plan: PlanFacts): number {
  return Math.min(
    MAX_DRAFT_TOKENS,
    FIXED_TOKEN_ALLOWANCE + plan.priority.length * TOKENS_PER_PRIORITY + plan.moves.length * TOKENS_PER_MOVE,
  )
}

const SYSTEM = [
  'Copy the actual plan sentences exactly, one sentence per line, in their given order.',
  'Do not number, summarize, relabel, reorder, omit, combine, or add words.',
  'Keep every barangay name, score or range, stock source, recipient, and amount unchanged.',
  'A stock move is only a suggestion for the MHO to decide, never an approval.',
  'Do not add a dose, schedule, diagnosis, treatment instruction, or any other action.',
  'Output only the ACTUAL PLAN sentences; ignore the SAMPLE exchange and never reuse its placeholders.',
].join('\n')

const SAMPLE_SENTENCES = [
  'The doctor team for SAMPLE_PLACE has priority score SAMPLE_SCORE.',
  'Consider moving from SAMPLE_SOURCE to SAMPLE_TARGET: up to SAMPLE_AMOUNT capsules, for the MHO to decide.',
]

function actualSentences(plan: PlanFacts): string[] {
  const priorities = plan.priority.map(
    (entry) => `The doctor team for ${entry.name} has priority score ${formatRange(entry.score)}.`,
  )
  const moves = plan.moves.map(
    (move) => `Consider moving from ${move.fromName} to ${move.toName}: up to ${formatCount(move.capsulesUpTo)} capsules, for the MHO to decide.`,
  )
  return [...priorities, ...moves]
}

export function buildMessages(plan: PlanFacts): ChatMessage[] {
  const lines = actualSentences(plan)
  const actual: ChatMessage = {
    role: 'user',
    content: lines.length
      ? `ACTUAL PLAN — copy these complete sentences exactly, in order:\n${lines.join('\n')}`
      : 'ACTUAL PLAN — no action sentences are supplied. Return an empty response.',
  }

  // With no facts, omit the sample so an empty plan cannot inherit its example.
  if (!lines.length) return [{ role: 'system', content: SYSTEM }, actual]

  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `SAMPLE ONLY — placeholder facts, not a real plan. Copy no sample words into the answer.\n${SAMPLE_SENTENCES.join('\n')}`,
    },
    { role: 'assistant', content: SAMPLE_SENTENCES.join('\n') },
    actual,
  ]
}
