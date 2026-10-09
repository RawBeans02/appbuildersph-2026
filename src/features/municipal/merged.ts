import type { ReceivedPayload } from '../../data/db/types'
import { AGE_BANDS, countRange, formatRange, HINGA_AGE_BANDS, type CountRange } from '../../qr'
import type { MunicipalPlan, PlanRow, PriorityEntry } from '../../rules/plan'
import { addRanges, barangayCodes, cellRange, exposedOf, fastBreathingOf, formatReceivedAt, isZero, nameOf } from './counts'
import { receivedPayloadId } from './scan/classify'

// Screen 18, the merged view: one row per barangay with the counts it sent,
// the totals, the doctor-team priority row and why it comes first. Cells
// that stand for "<5" show as 1–4; a total that adds one is a range with an
// en dash (formatRange). Pure, so the numbers are unit-tested.

export type MergedCells = {
  exposed: string
  inWatchWindow: string
  fastBreathing: string
  doxyOnHand: string
  doxyExpiring: string
}

export type MergedRow =
  | {
      kind: 'received'
      barangay: string
      name: string
      // "9:05 AM · #3"
      received: string
      // Its newest QR is from an earlier week than the plan's.
      olderWeek: string | null
      priority: boolean
      cells: MergedCells
      // Some of its doxycycline expires within 6 weeks (the cell is amber).
      expiring: boolean
    }
  | { kind: 'waiting'; barangay: string; name: string }

export type MergedView = {
  epiWeek: string
  received: number
  expected: number
  rows: MergedRow[]
  // "All 5 barangays", or "3 of 5 barangays".
  totalLabel: string
  totals: MergedCells
  // "Why Maligaya-D first:" and the reason, when one barangay comes first.
  why: { name: string; reason: string } | null
}

const DASH = '–'

export const rowCells = (row: PlanRow): MergedCells => ({
  exposed: formatRange(exposedOf(row.counts)),
  inWatchWindow: cellRange(row.counts.inWatchWindow),
  fastBreathing: formatRange(fastBreathingOf(row.counts)),
  doxyOnHand: cellRange(row.counts.doxyCapsulesOnHand),
  doxyExpiring: cellRange(row.counts.doxyCapsulesExpiring6w),
})

export const WAITING_CELLS: MergedCells = {
  exposed: DASH,
  inWatchWindow: DASH,
  fastBreathing: DASH,
  doxyOnHand: DASH,
  doxyExpiring: DASH,
}

export function totalCells(plan: MunicipalPlan): MergedCells {
  const { totals } = plan
  return {
    exposed: formatRange(addRanges(AGE_BANDS.map((band) => totals.exposed[band]))),
    inWatchWindow: formatRange(totals.inWatchWindow),
    fastBreathing: formatRange(addRanges(HINGA_AGE_BANDS.map((band) => totals.fastBreathing[band]))),
    doxyOnHand: formatRange(totals.doxyCapsulesOnHand),
    doxyExpiring: formatRange(totals.doxyCapsulesExpiring6w),
  }
}

// The barangay the doctor team goes to first: rank 1, when its score isn't 0
// (with nobody in the watch window and no referrals, no one comes first).
export function firstPriority(plan: MunicipalPlan): { entry: PriorityEntry; row: PlanRow } | null {
  const entry = plan.priority[0]
  if (!entry || isZero(entry.score)) return null
  const row = plan.rows.find((item) => item.barangay === entry.barangay)
  return row ? { entry, row } : null
}

// Certainly the most: its smallest possible count is above every other
// barangay's largest.
const isMost = (row: PlanRow, rows: readonly PlanRow[], of: (row: PlanRow) => CountRange) =>
  rows.every((other) => other === row || of(row).min > of(other).max)

// The reason's parts: watch window, fast-breathing referrals, URGENT
// referrals, expiring capsules; each only when it isn't 0.
// 'merged' (screen 18): "the most residents in the watch window (9), …, and
// 30 of its 40 capsules expire within 6 weeks."
// 'step' (screen 19's first step): "9 residents in the watch window, …, 30 of
// 40 capsules expire within 6 weeks."
export function priorityReason(plan: MunicipalPlan, row: PlanRow, style: 'merged' | 'step'): string {
  const counts = row.counts
  const watch = countRange(counts.inWatchWindow)
  const fast = fastBreathingOf(counts)
  const urgent = countRange(counts.urgentReferrals)
  const expiring = countRange(counts.doxyCapsulesExpiring6w)
  const parts: string[] = []
  if (!isZero(watch)) {
    const most = style === 'merged' && isMost(row, plan.rows, (item) => countRange(item.counts.inWatchWindow))
    parts.push(`${most ? 'the most residents' : `${formatRange(watch)} residents`} in the watch window${most ? ` (${formatRange(watch)})` : ''}`)
  }
  if (!isZero(fast)) parts.push(`fast-breathing referrals (${formatRange(fast)})`)
  if (!isZero(urgent)) parts.push(`URGENT referrals (${formatRange(urgent)})`)
  if (!isZero(expiring)) {
    const onHand = cellRange(counts.doxyCapsulesOnHand)
    parts.push(`${formatRange(expiring)} of ${style === 'merged' ? 'its ' : ''}${onHand} capsules expire within 6 weeks`)
  }
  if (style === 'step' || parts.length < 2) return `${parts.join(', ')}.`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`
}

// `plan` is null when no barangay has sent counts yet.
export function mergedView(
  plan: MunicipalPlan | null,
  received: readonly ReceivedPayload[],
  options: { now?: Date } = {},
): MergedView {
  const rows = plan?.rows ?? []
  const first = plan ? firstPriority(plan) : null
  const codes = barangayCodes([...rows.map((row) => row.barangay), ...received.map((item) => item.barangay)])
  const merged = codes.map((code): MergedRow => {
    const row = rows.find((item) => item.barangay === code)
    if (!row) return { kind: 'waiting', barangay: code, name: nameOf(code) }
    const stored = received.find((item) => item.id === receivedPayloadId(row))
    const at = stored ? `${formatReceivedAt(stored.receivedAt, options.now)} · ` : ''
    return {
      kind: 'received',
      barangay: code,
      name: row.name,
      received: `${at}#${row.seq}`,
      olderWeek: row.olderWeek ? row.epiWeek : null,
      priority: first?.row === row,
      cells: rowCells(row),
      expiring: !isZero(countRange(row.counts.doxyCapsulesExpiring6w)),
    }
  })
  const count = rows.length
  return {
    epiWeek: plan?.epiWeek ?? '',
    received: count,
    expected: codes.length,
    rows: merged,
    totalLabel: count === codes.length ? `All ${count} barangays` : `${count} of ${codes.length} barangays`,
    totals: plan ? totalCells(plan) : WAITING_CELLS,
    why: plan && first ? { name: first.row.name, reason: priorityReason(plan, first.row, 'merged') } : null,
  }
}
