import { clockTime, monthYear, weekdayMonthDay } from '../../lib/format'
import { localToday } from '../../rules/dates'
import type { LotStatus } from '../../rules/stock'

// The wording of screen 13 (design/COPY.md), from the rules' values.

const STATUS_WORDS: Record<LotStatus, string> = {
  ok: 'usable',
  expiring: 'within 6 weeks',
  expired: 'expired: set aside',
}

// "EXP Nov 2026 · within 6 weeks"
export const lotStatusLine = (expiry: string, status: LotStatus) => `EXP ${monthYear(expiry)} · ${STATUS_WORDS[status]}`

// A reason from reviewExposureStock(), verbatim, as a sentence.
export const reasonSentence = (reason: string) => (reason.endsWith('.') ? reason : `${reason}.`)

// "Sat, Oct 10, 9:01 AM": when a flag was raised, on this device's calendar
// and clock (never the UTC day).
export function flaggedAt(createdAt: string): string {
  const date = new Date(createdAt)
  return `${weekdayMonthDay(localToday(date))}, ${clockTime(date)}`
}
