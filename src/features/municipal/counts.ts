import { barangayName, DEMO_BARANGAYS } from '../../data/places'
import { AGE_BANDS, countRange, formatRange, HINGA_AGE_BANDS, sumCounts, type Count, type Counts, type CountRange } from '../../qr'

// Small shared helpers for the laptop screens: names, the barangay order,
// counts shown as ranges, and times.

export const nameOf = (code: string) => barangayName(code) ?? code

// The demo's five barangays in their usual order, then any other code seen
// (a phone paired for a barangay outside the demo list), alphabetically.
export function barangayCodes(seen: Iterable<string>): string[] {
  const known = DEMO_BARANGAYS.map((place) => place.code)
  const others = [...new Set(seen)].filter((code) => !known.includes(code)).sort()
  return [...known, ...others]
}

export const addRanges = (ranges: readonly CountRange[]): CountRange =>
  ranges.reduce((sum, range) => ({ min: sum.min + range.min, max: sum.max + range.max }), { min: 0, max: 0 })

// One cell on the laptop: "<5" shows as the range it stands for, "1–4", so
// cells and the totals that add them read the same way.
export const cellRange = (count: Count) => formatRange(countRange(count))

// The exposed age bands: residents exposed whose watch hasn't started yet
// (src/qr/schema.ts), so they don't include the watch window.
export const exposedOf = (counts: Counts): CountRange => sumCounts(AGE_BANDS.map((band) => counts.exposed[band]))

// Everyone exposed and still watched or about to be: the bands plus the
// watch window (the two are disjoint).
export const exposedAllOf = (counts: Counts): CountRange =>
  addRanges([exposedOf(counts), countRange(counts.inWatchWindow)])

export const fastBreathingOf = (counts: Counts): CountRange =>
  sumCounts(HINGA_AGE_BANDS.map((band) => counts.fastBreathing[band]))

export const isZero = (range: CountRange) => range.max === 0

// "9:05 AM" on this laptop's clock.
export const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// "Sat, Oct 10"
export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// When a QR came in: "9:05 AM" today, "Oct 9, 9:05 AM" on an earlier day.
export function formatReceivedAt(iso: string, now = new Date()): string {
  const at = new Date(iso)
  if (sameDay(at, now)) return formatClock(iso)
  return `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${formatClock(iso)}`
}
