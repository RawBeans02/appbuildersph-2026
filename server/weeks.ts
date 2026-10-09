import { isoWeek } from '../src/qr/index.js'

// The report weeks the server accepts, on the Philippine calendar (UTC+8, no
// daylight saving): from 8 weeks before this week up to this week, or the next
// week once it's at most 2 days away (a phone clock a little ahead, a late
// Sunday upload). A report outside them is refused: a future week would sit at
// the top of the DOH view and drive the alerts until that week came, and a
// very old one is no use to anyone. ISO weeks sort as text ("2026-W09" <
// "2026-W41" < "2027-W01").

const MANILA_OFFSET_MS = 8 * 60 * 60_000
const DAY_MS = 86_400_000
export const WEEK_MARGIN_DAYS = 2
export const MAX_REPORT_AGE_WEEKS = 8

export type WeekWindow = { earliest: string; latest: string }

// The ISO week of a moment, by the date in the Philippines.
export function manilaWeek(at: Date): string {
  const manila = new Date(at.getTime() + MANILA_OFFSET_MS)
  // isoWeek reads a date's local calendar day: hand it the Manila day, at noon.
  return isoWeek(new Date(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate(), 12))
}

export function acceptedWeeks(now: Date): WeekWindow {
  return {
    earliest: manilaWeek(new Date(now.getTime() - MAX_REPORT_AGE_WEEKS * 7 * DAY_MS)),
    latest: manilaWeek(new Date(now.getTime() + WEEK_MARGIN_DAYS * DAY_MS)),
  }
}

export const weekAccepted = (epiWeek: string, window: WeekWindow) => epiWeek >= window.earliest && epiWeek <= window.latest

// The per-report message when a week is refused: the server's window, never
// the value sent.
export const weekRefusal = (window: WeekWindow) =>
  `The report's week is outside the weeks the server accepts (${window.earliest} to ${window.latest}): ` +
  `a future week, or one more than ${MAX_REPORT_AGE_WEEKS} weeks old. Check the phone's date.`
