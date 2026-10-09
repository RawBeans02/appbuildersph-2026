import { clockTime } from '../../lib/format'
import { isoWeek } from '../../qr'
import type { MunicipalPlan } from '../../rules/plan'
import type { LaptopSection } from './LaptopFrame'
import type { LogEntry } from './municipal'
import type { Slots } from './slots'
import { planSteps } from './steps'

// The LoopStrip's five steps (design pass 2, A3): reports in, merged, plan,
// approved, back to the barangay. Status only, all from the records on this
// laptop: this week's reports, the merged rows, the plan's steps and this
// week's latest approval in the log.

export type LoopStepId = 'reports' | 'merged' | 'plan' | 'approved' | 'back'

// done: its check in --ok. reached: there is something, not finished yet.
// waiting: not reached, in --ink-3.
export type LoopStepState = 'done' | 'reached' | 'waiting'

export type LoopStep = { id: LoopStepId; label: string; status: string; state: LoopStepState }

export type LoopModel = {
  steps: LoopStep[]
  // Step 1's mini meter: one segment per barangay, in list order.
  meter: { barangay: string; received: boolean }[]
  // This week's latest approval, when there is one.
  approvalId: string | null
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// The week an approval is for: its plan's week, else the week it was approved in.
export const weekOfEntry = (entry: LogEntry): string =>
  entry.plan?.epiWeek ?? isoWeek(new Date(entry.approval.approvedAt))

export function latestApproval(log: readonly LogEntry[], week: string): LogEntry | null {
  return log
    .filter((entry) => weekOfEntry(entry) === week)
    .reduce<LogEntry | null>((latest, entry) => (!latest || entry.approval.approvedAt > latest.approval.approvedAt ? entry : latest), null)
}

export function loopModel({
  slots,
  plan,
  log,
  formatTime = (iso) => clockTime(new Date(iso)),
}: {
  slots: Slots
  plan: MunicipalPlan | null
  log: readonly LogEntry[]
  formatTime?: (iso: string) => string
}): LoopModel {
  const merged = plan?.rows.length ?? 0
  const stepCount = plan ? planSteps(plan).length : 0
  const approval = latestApproval(log, slots.week)
  const steps: LoopStep[] = [
    {
      id: 'reports',
      label: 'Reports in',
      status: `${slots.received} of ${slots.expected}`,
      state: slots.expected > 0 && slots.received === slots.expected ? 'done' : slots.received > 0 ? 'reached' : 'waiting',
    },
    merged > 0
      ? { id: 'merged', label: 'Merged', status: plural(merged, 'barangay'), state: 'done' }
      : { id: 'merged', label: 'Merged', status: 'Waiting for reports', state: 'waiting' },
    stepCount > 0
      ? { id: 'plan', label: 'Plan', status: plural(stepCount, 'step'), state: 'done' }
      : { id: 'plan', label: 'Plan', status: 'Waiting for reports', state: 'waiting' },
    approval
      ? { id: 'approved', label: 'Approved', status: formatTime(approval.approval.approvedAt), state: 'done' }
      : { id: 'approved', label: 'Approved', status: 'Not yet', state: 'waiting' },
    // "Return QR ready" means approved this week; no "QR made" record is needed.
    approval
      ? { id: 'back', label: 'Back to the barangay', status: 'Return QR ready', state: 'reached' }
      : { id: 'back', label: 'Back to the barangay', status: 'After approval', state: 'waiting' },
  ]
  return {
    steps,
    meter: slots.slots.map((slot) => ({ barangay: slot.barangay, received: !!slot.thisWeek })),
    approvalId: approval?.approval.id ?? null,
  }
}

// The strip's step for a laptop screen. The return QR screen sits under Plan
// in the nav, but it is step 5. Sync (phase 2) has no step.
export function stepForScreen(active: LaptopSection, path: string): LoopStepId | null {
  if (path.startsWith('/municipal/return')) return 'back'
  const steps: Record<LaptopSection, LoopStepId | null> = {
    scan: 'reports',
    merged: 'merged',
    plan: 'plan',
    log: 'approved',
    sync: null,
  }
  return steps[active]
}

// What arrived since the last list: nothing on the first one, so nothing
// moves when a screen opens.
export function arrivals(before: readonly string[] | null, after: readonly string[]): string[] {
  return before ? after.filter((key) => !before.includes(key)) : []
}
