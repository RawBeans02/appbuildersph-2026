import { DEMO_BARANGAYS } from '../../data/places'
import type { MunicipalPlan } from '../../rules/plan'
import { barangayCodes, formatClock, formatDay } from './counts'
import type { LogEntry } from './municipal'
import { planShortSummary } from './steps'

// Screen 20's rows: when, who (a role, never a name), the plan in short, how
// many barangays it came from, and where the wording came from.

export type LogRow = {
  id: string
  day: string
  time: string
  approver: string
  plan: string
  // "5 of 5 barangays", with its week.
  from: string | null
  week: string | null
  wording: 'AI draft' | 'AI draft, edited' | 'Rules only'
}

// The stored plan's rules, when they have the shape this version writes.
export function storedPlan(rules: unknown): MunicipalPlan | null {
  const plan = rules as Partial<MunicipalPlan> | null
  return plan &&
    typeof plan.epiWeek === 'string' &&
    Array.isArray(plan.rows) &&
    Array.isArray(plan.priority) &&
    Array.isArray(plan.moves) &&
    typeof plan.totals === 'object'
    ? (plan as MunicipalPlan)
    : null
}

export function wordingLabel(entry: LogEntry): LogRow['wording'] {
  const plan = entry.plan
  if (plan?.draftSource !== 'llm') return 'Rules only'
  return plan.finalText.trim() === (plan.draftText ?? '').trim() ? 'AI draft' : 'AI draft, edited'
}

export function logRow(entry: LogEntry): LogRow {
  const { approval } = entry
  const rules = storedPlan(entry.plan?.rules)
  const expected = rules ? barangayCodes(rules.rows.map((row) => row.barangay)).length : DEMO_BARANGAYS.length
  return {
    id: approval.id,
    day: formatDay(approval.approvedAt),
    time: formatClock(approval.approvedAt),
    approver: approval.approver,
    plan: rules ? planShortSummary(rules) : approval.planSummary,
    from: rules ? `${rules.rows.length} of ${expected} barangays` : null,
    week: rules?.epiWeek ?? entry.plan?.epiWeek ?? null,
    wording: wordingLabel(entry),
  }
}
