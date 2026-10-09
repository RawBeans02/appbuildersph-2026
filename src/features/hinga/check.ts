import type { HingaCheck } from '../../data/db/types'
import { hingaOutcome, type DangerSign } from '../../rules/imci'
import type { CountRefusal } from './countSession'

// The record a finished Hinga check saves on the phone (IndexedDB). Only the
// count, how it was counted, the outcome and the danger signs are kept; no
// video, image or audio.

export type CountMethodUsed = NonNullable<HingaCheck['method']>

export type CheckInput = {
  id: string
  residentId: string | null
  checkedAt: string
  ageMonths: number
  // 'camera': the camera AI counted; 'hand': the health worker tapped once per
  // breath for 60 s (L8b).
  method: CountMethodUsed
  // null when the camera could not count.
  breathsPerMinute: number | null
  // Why the last count was refused; kept only when there is no count.
  refusal: CountRefusal | null
  dangerSigns: readonly DangerSign[]
}

// null when the age is outside the IMCI range (under 5 years).
export function buildHingaCheck(input: CheckInput): HingaCheck | null {
  const outcome = hingaOutcome(input)
  if (outcome === null) return null
  return {
    id: input.id,
    residentId: input.residentId,
    checkedAt: input.checkedAt,
    ageMonths: input.ageMonths,
    breathsPerMinute: input.breathsPerMinute,
    outcome,
    refusal: input.breathsPerMinute === null ? (input.refusal ?? 'not-counted') : null,
    dangerSigns: [...input.dangerSigns],
    method: input.method,
    sample: false,
  }
}

export const newCheckId = () => `hinga-${crypto.randomUUID()}`
