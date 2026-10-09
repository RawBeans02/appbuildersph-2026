import { MAX_REPORT_AGE_WEEKS, type WeekWindow } from '../src/qr/index.js'

// The report weeks the server accepts: the rule lives in src/qr/weeks.ts,
// shared with the municipal laptop's scan. From 8 weeks before this week (in
// Manila) up to this week, or the next week once it's at most 2 days away.
export {
  MAX_REPORT_AGE_WEEKS,
  WEEK_MARGIN_DAYS,
  acceptedWeeks,
  manilaWeek,
  weekAccepted,
  type WeekWindow,
} from '../src/qr/index.js'

// The per-report message when a week is refused: the server's window, never
// the value sent.
export const weekRefusal = (window: WeekWindow) =>
  `The report's week is outside the weeks the server accepts (${window.earliest} to ${window.latest}): ` +
  `a future week, or one more than ${MAX_REPORT_AGE_WEEKS} weeks old. Check the phone's date.`
