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
  wording: 'AI draft' | 'AI draft, edited' | 'Written by the officer' | 'Rules only'
  // The full approved text (B25), as saved.
  text: string | null
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
  if (!plan) return 'Rules only'
  if (plan.draftSource === 'llm') {
    return plan.finalText.trim() === (plan.draftText ?? '').trim() ? 'AI draft' : 'AI draft, edited'
  }
  // No AI: approvePlan keeps a draft text only when the officer wrote wording
  // ('' when they started from an empty box); with none, the steps are the text.
  return plan.draftText !== null && plan.finalText.trim() !== plan.draftText.trim() ? 'Written by the officer' : 'Rules only'
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
    text: entry.plan?.finalText.trim() || null,
  }
}

// 20c: approvals made in this browser session, so the log can mark the newest
// one "Just now" for the visit and play its arrival once. Storage may be
// blocked: then nothing is marked.

const APPROVED = 'agapay.approvedThisSession'
const LOG_SHOWN = 'agapay.logShownNewest'

type SessionStore = Pick<Storage, 'getItem' | 'setItem'>

function store(): SessionStore | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

export function noteApproved(id: string, storage: SessionStore | null = store()): void {
  try {
    if (!storage) return
    const ids = approvedThisSession(storage)
    if (!ids.includes(id)) storage.setItem(APPROVED, JSON.stringify([...ids, id].slice(-20)))
  } catch {
    // Blocked storage: nothing to note.
  }
}

export function approvedThisSession(storage: SessionStore | null = store()): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(APPROVED) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

// The newest row's id when it was approved in this session (it shows "Just
// now"), and whether this is the first time the log shows it (it lands).
export function justApproved(
  rows: readonly Pick<LogRow, 'id'>[],
  storage: SessionStore | null = store(),
): { id: string; land: boolean } | null {
  const newest = rows[0]
  if (!newest || !approvedThisSession(storage).includes(newest.id)) return null
  try {
    if (!storage || storage.getItem(LOG_SHOWN) === newest.id) return { id: newest.id, land: false }
    storage.setItem(LOG_SHOWN, newest.id)
    return { id: newest.id, land: true }
  } catch {
    return { id: newest.id, land: false }
  }
}
