import type { Exposure, ExposureKind } from '../data/db/types'
import { addDays, daysBetween } from './dates'

// The leptospirosis watch window after floodwater exposure: day 5 to day 15
// after contact, inclusive. Source: DOH Usec. Balboa, symptoms show 5 to 15
// days after flood exposure (Manila Times, Sept 3, 2026; link in the README,
// "Medical sources"). A resident exposed on several days is watched from 5 days after the
// first contact to 15 days after the last. This only says whom to watch and
// when; it never diagnoses, and any symptoms go to the midwife or RHU.

export const WATCH_START_DAY = 5
export const WATCH_END_DAY = 15

export type WatchPhase = 'upcoming' | 'active' | 'ended'

export type WatchEntry = {
  residentId: string
  firstExposedOn: string
  lastExposedOn: string
  windowStart: string
  windowEnd: string
  phase: WatchPhase
  // Days until the window opens (upcoming), or days left in it (active).
  daysToStart: number
  daysLeft: number
  // The watch-list row's "Day {n} of 15": days since the last contact, so
  // day 15 is always the window's last day (0 on the day of contact).
  day: number
  // Every kind of exposure logged, plus 'repeated' when contact happened on
  // more than one day.
  kinds: ExposureKind[]
  // An open wound or repeated contact.
  higherRisk: boolean
}

// The window for contact from `firstExposedOn` to `lastExposedOn`: from day 5
// after the first contact to day 15 after the last, inclusive.
export function watchWindow(firstExposedOn: string, lastExposedOn = firstExposedOn): { start: string; end: string } {
  return { start: addDays(firstExposedOn, WATCH_START_DAY), end: addDays(lastExposedOn, WATCH_END_DAY) }
}

const PHASE_ORDER: Record<WatchPhase, number> = { active: 0, upcoming: 1, ended: 2 }
const KIND_ORDER: ExposureKind[] = ['waded', 'open-wound', 'repeated']

export function watchList(exposures: Exposure[], today: string): WatchEntry[] {
  const byResident = new Map<string, Exposure[]>()
  for (const exposure of exposures) {
    const list = byResident.get(exposure.residentId) ?? []
    list.push(exposure)
    byResident.set(exposure.residentId, list)
  }

  const entries: WatchEntry[] = []
  for (const [residentId, list] of byResident) {
    const days = [...new Set(list.map((e) => e.exposedOn))].sort()
    const firstExposedOn = days[0]
    const lastExposedOn = days[days.length - 1]
    const { start: windowStart, end: windowEnd } = watchWindow(firstExposedOn, lastExposedOn)
    const kindSet = new Set(list.flatMap((e) => e.kinds))
    if (days.length > 1) kindSet.add('repeated')
    const kinds = KIND_ORDER.filter((kind) => kindSet.has(kind))
    const phase: WatchPhase =
      daysBetween(today, windowStart) > 0 ? 'upcoming' : daysBetween(windowEnd, today) > 0 ? 'ended' : 'active'
    entries.push({
      residentId,
      firstExposedOn,
      lastExposedOn,
      windowStart,
      windowEnd,
      phase,
      daysToStart: Math.max(0, daysBetween(today, windowStart)),
      daysLeft: Math.max(0, daysBetween(today, windowEnd)),
      day: daysBetween(lastExposedOn, today),
      kinds,
      higherRisk: kindSet.has('open-wound') || kindSet.has('repeated'),
    })
  }

  // Active first, higher risk first, then the window closing soonest.
  return entries.sort(
    (a, b) =>
      PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
      Number(b.higherRisk) - Number(a.higherRisk) ||
      a.windowEnd.localeCompare(b.windowEnd) ||
      a.residentId.localeCompare(b.residentId),
  )
}

// Residents still to watch (window upcoming or open): the "exposed" count the
// stock comparison uses.
export function watchedCount(entries: WatchEntry[]): number {
  return entries.filter((entry) => entry.phase !== 'ended').length
}
