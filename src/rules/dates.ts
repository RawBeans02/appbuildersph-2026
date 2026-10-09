// Calendar-day math on YYYY-MM-DD strings, in UTC so a time zone or daylight
// saving change never shifts a day.

const DAY_MS = 86_400_000

function toUtc(day: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) throw new RangeError(`Expected a YYYY-MM-DD date, got "${day}"`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function addDays(day: string, days: number): string {
  return new Date(toUtc(day) + days * DAY_MS).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

// Today on this device's calendar, as YYYY-MM-DD.
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
