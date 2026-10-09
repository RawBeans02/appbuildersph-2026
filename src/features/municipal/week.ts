import { isoWeek } from '../../qr'
import { isEpiWeek } from '../../qr/schema'

// The report week on the municipal laptop, and its days for the screen
// headers ("Week 2026-W41 · Oct 5 to 11"). Weeks are ISO weeks, Monday to
// Sunday, the same as the barangay QRs.

const DAY_MS = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The Monday of an ISO week, at 00:00 UTC. Week 1 is the week with Jan 4 in it.
export function isoWeekMonday(epiWeek: string): Date {
  if (!isEpiWeek(epiWeek)) throw new RangeError(`Expected an ISO week like 2026-W41, got "${epiWeek}"`)
  const year = Number(epiWeek.slice(0, 4))
  const week = Number(epiWeek.slice(6))
  const jan4Weekday = new Date(Date.UTC(year, 0, 4)).getUTCDay() || 7
  return new Date(Date.UTC(year, 0, 4 - (jan4Weekday - 1) + (week - 1) * 7))
}

// "Oct 5 to 11", or "Sep 28 to Oct 4" when the week spans two months.
export function weekDaysLabel(epiWeek: string): string {
  const monday = isoWeekMonday(epiWeek)
  const sunday = new Date(monday.getTime() + 6 * DAY_MS)
  const first = `${MONTHS[monday.getUTCMonth()]} ${monday.getUTCDate()}`
  return monday.getUTCMonth() === sunday.getUTCMonth()
    ? `${first} to ${sunday.getUTCDate()}`
    : `${first} to ${MONTHS[sunday.getUTCMonth()]} ${sunday.getUTCDate()}`
}

// The week the laptop reports on: the newest week any barangay has sent, so
// the home, the merged view and the plan all name the same week. This week on
// the laptop's calendar when nothing has come in yet.
export function reportWeek(received: readonly { epiWeek: string }[], now = new Date()): string {
  return received.reduce((newest, item) => (item.epiWeek > newest ? item.epiWeek : newest), '') || isoWeek(now)
}
