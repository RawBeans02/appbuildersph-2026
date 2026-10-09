import { formatRange } from '../../qr'
import type { PriorityEntry, ScoreComponentKey } from '../../rules/plan'

// 18d, the doctor-team order: one stacked bar per received barangay, in the
// plan's priority order, scaled so the largest score is BAR_MAX_PX wide. Each
// part of the score (URGENT ×3, fast breathing ×2, watch window ×1) is drawn
// solid up to its smallest possible points; a "<5" cell adds a dashed part up
// to its largest. Pure, so the geometry is unit-tested.

export const BAR_MAX_PX = 360

export type BarSegment = {
  key: ScoreComponentKey
  // Width in px of the solid part (the points' minimum).
  solid: number
  // Width in px of the dashed part beyond it, up to the maximum; 0 when exact.
  dashed: number
}

export type DoctorOrderRow = {
  barangay: string
  name: string
  // "17", or "14–17" when a "<5" cell makes it a range.
  score: string
  segments: BarSegment[]
  // The bar's text alternative.
  label: string
}

const WORDS: Record<ScoreComponentKey, string> = {
  urgentReferrals: 'URGENT referrals',
  fastBreathing: 'fast-breathing referrals',
  inWatchWindow: 'in the watch window',
}

export function doctorOrder(priority: readonly PriorityEntry[], maxWidth = BAR_MAX_PX): DoctorOrderRow[] {
  const largest = Math.max(0, ...priority.map((entry) => entry.score.max))
  const px = (points: number) => (largest === 0 ? 0 : (points / largest) * maxWidth)
  return priority.map((entry) => ({
    barangay: entry.barangay,
    name: entry.name,
    score: formatRange(entry.score),
    segments: entry.components.map((part) => ({
      key: part.key,
      solid: px(part.points.min),
      dashed: px(part.points.max - part.points.min),
    })),
    label: `score ${formatRange(entry.score)}. ${entry.components.map((part) => `${WORDS[part.key]} ${formatRange(part.count)}`).join(', ')}.`,
  }))
}
