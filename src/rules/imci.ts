import type { HingaOutcome } from '../data/db/types'

// WHO IMCI Chart Booklet, March 2014:
// https://cdn.who.int/media/docs/default-source/mca-documents/child/imci-integrated-management-of-childhood-illness/imci-in-service-training/imci-chart-booklet.pdf
// Fast breathing by age, and the signs that make Hinga refer urgently. Hinga's
// output is only "fast breathing for age" or not; it is a screening aid, never
// a diagnosis.
//   under 2 months:            60 breaths per minute or more
//   2 months up to 12 months:  50 or more
//   12 months up to 5 years:   40 or more (a child of exactly 12 months uses 40)

export const MAX_AGE_MONTHS = 60

// The cut-off in breaths per minute, or null when the age is outside the IMCI
// range (under 5 years) or not a valid age.
export function fastBreathingCutoff(ageMonths: number): number | null {
  if (!Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths >= MAX_AGE_MONTHS) return null
  if (ageMonths < 2) return 60
  if (ageMonths < 12) return 50
  return 40
}

export type AgeBandLabel = 'under 2 months' | '2 to 12 months' | '12 months to 5 years'

export function ageBandLabel(ageMonths: number): AgeBandLabel | null {
  const cutoff = fastBreathingCutoff(ageMonths)
  return cutoff === 60 ? 'under 2 months' : cutoff === 50 ? '2 to 12 months' : cutoff === 40 ? '12 months to 5 years' : null
}

// Whole months from a birth date to a day (YYYY-MM-DD), the way ages in months
// are counted (the same rule as the QR's age bands).
export function completedMonths(birthDate: string, day: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = day.split('-').map(Number)
  return (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0)
}

// The four IMCI 2014 general danger signs, then two severe signs of the cough
// or difficult breathing assessment. This app refers urgently on ANY of them.
// For chest indrawing and stridor that is MORE cautious than IMCI 2014, by
// design: there, stridor in a calm child is a severe sign, but chest indrawing
// at 2-59 months alone classifies as "Pneumonia", not severe. Hinga is a
// screening aid that only refers; it never treats or classifies.
export const DANGER_SIGNS_TITLE = 'Danger signs and severe signs. This app refers urgently on any'

export const DANGER_SIGNS_NOTE =
  'Chest indrawing and stridor are referred urgently here, which is more cautious than WHO IMCI 2014: this app is a screening aid that only refers.'

export const DANGER_SIGNS = [
  { id: 'unable-to-drink', kind: 'general', label: 'Not able to drink or breastfeed' },
  { id: 'vomits-everything', kind: 'general', label: 'Vomits everything' },
  { id: 'convulsions', kind: 'general', label: 'Convulsions (now or during this illness)' },
  { id: 'lethargic', kind: 'general', label: 'Lethargic or unconscious' },
  { id: 'chest-indrawing', kind: 'severe', label: 'Chest indrawing' },
  { id: 'stridor', kind: 'severe', label: 'Stridor in a calm child' },
] as const

export type DangerSign = (typeof DANGER_SIGNS)[number]['id']

// The check's outcome: any sign in DANGER_SIGNS makes it urgent, whatever the count;
// otherwise fast or not fast against the cut-off, or refused when the camera
// could not count. null when the age is outside the IMCI range.
export function hingaOutcome(input: {
  breathsPerMinute: number | null
  ageMonths: number
  dangerSigns: readonly DangerSign[]
}): HingaOutcome | null {
  const cutoff = fastBreathingCutoff(input.ageMonths)
  if (cutoff === null) return null
  if (input.dangerSigns.length > 0) return 'urgent'
  if (input.breathsPerMinute === null) return 'refused'
  return input.breathsPerMinute >= cutoff ? 'fast' : 'not-fast'
}
