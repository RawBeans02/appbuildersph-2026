// WHO IMCI (2014 chart booklet) fast-breathing cut-offs by age. The output is
// only "fast breathing for age" or not; it is a breathing-rate check, not a
// diagnosis.
//   under 2 months:            60 breaths per minute or more
//   2 months up to 12 months:  50 or more
//   12 months up to 5 years:   40 or more (a child of exactly 12 months uses 40)

export const MAX_AGE_MONTHS = 60

// The cut-off in breaths per minute, or null when the age is outside the
// IMCI range (under 5 years) or not a valid age.
export function fastBreathingCutoff(ageMonths: number): number | null {
  if (!Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths >= MAX_AGE_MONTHS) return null
  if (ageMonths < 2) return 60
  if (ageMonths < 12) return 50
  return 40
}

export type Classification =
  | { kind: 'fast'; cutoff: number }
  | { kind: 'not-fast'; cutoff: number }
  | { kind: 'out-of-range' }

export function classifyBreathing(perMin: number, ageMonths: number): Classification {
  const cutoff = fastBreathingCutoff(ageMonths)
  if (cutoff === null) return { kind: 'out-of-range' }
  return perMin >= cutoff ? { kind: 'fast', cutoff } : { kind: 'not-fast', cutoff }
}
