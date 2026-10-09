// Display formats shared by the screens (design/COPY.md). Dates are
// YYYY-MM-DD calendar days, shown in English as the copy deck writes them.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parts(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return { year: y, month: m, day: d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

// "Oct 15"
export function monthDay(day: string): string {
  const p = parts(day)
  return `${MONTHS[p.month - 1]} ${p.day}`
}

// "Sun, Oct 4"
export function weekdayMonthDay(day: string): string {
  return `${WEEKDAYS[parts(day).weekday]}, ${monthDay(day)}`
}

// "Sat Oct 10" (the Home section heading writes it without the comma)
export function weekdayMonthDayPlain(day: string): string {
  return `${WEEKDAYS[parts(day).weekday]} ${monthDay(day)}`
}

// "Oct 9 to 19", or "Oct 30 to Nov 9" across months.
export function dayRange(from: string, to: string): string {
  const a = parts(from)
  const b = parts(to)
  return a.month === b.month && a.year === b.year ? `${monthDay(from)} to ${b.day}` : `${monthDay(from)} to ${monthDay(to)}`
}

// "Nov 2026" from YYYY-MM
export function monthYear(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

// "55.1 MB" (decimal MB, one decimal)
export function formatMB(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`
}

// Free space: "2.1 GB" from 1 GB up, else "21.4 MB".
export function formatFreeSpace(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : formatMB(bytes)
}

// "8:31 AM" on the device's clock.
export function clockTime(date: Date): string {
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
}
