import type { Exposure, Flag, FloodEvent, HingaCheck, StockLot } from '../../data/db/types'
import { isoWeek } from '../../qr'
import { addDays, daysBetween } from '../../rules/dates'
import { summarizeDoxycycline } from '../../rules/stock'
import { WATCH_END_DAY, WATCH_START_DAY, watchList } from '../../rules/watch'
import { currentFlood } from '../flood/flood'

// Screen 1's numbers, in one pure selector so the home screen and its tests
// agree. Counts only; the home screen shows no names.

export type HomeSummary = {
  flood: {
    startedOn: string
    // Days since the flood started (0 on that day).
    day: number
    // Where today falls in the watch window counted from the flood's start.
    window: 'before' | 'open' | 'over'
    // Days 5 and 15 after the start.
    windowStart: string
    windowEnd: string
    // The areas logged with the flood, if any.
    puroks: string[]
  } | null
  watch: {
    active: number
    upcoming: number
    // Of the people in the window now, those at higher risk (an open wound
    // or repeated contact). Home writes it under the in-the-window count.
    higherRisk: number
    // When the soonest upcoming window opens.
    nextStart: string | null
  }
  hingaThisWeek: {
    fast: number
    urgent: number
    refused: number
    // Children referred this week (fast or urgent), and the latest referral.
    referred: number
    lastReferredAt: string | null
  }
  doxycycline: { onHand: number; expiringSoon: number; expired: number }
  openFlags: number
  // null: not known yet (still checking the model cache).
  modelsPrepared: boolean | null
}

export type HomeRecords = {
  floodEvents: FloodEvent[]
  exposures: Exposure[]
  hingaChecks: HingaCheck[]
  stockLots: StockLot[]
  flags: Flag[]
}

const localDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function summarizeHome(records: HomeRecords, today: string, modelsPrepared: boolean | null): HomeSummary {
  const flood = currentFlood(records.floodEvents)
  const floodDay = flood ? daysBetween(flood.startedOn, today) : 0
  const watch = watchList(records.exposures, today).filter((entry) => entry.phase !== 'ended')
  const week = isoWeek(localDate(today))
  const thisWeek = records.hingaChecks.filter((check) => isoWeek(new Date(check.checkedAt)) === week)
  const referrals = thisWeek
    .filter((check) => check.outcome === 'fast' || check.outcome === 'urgent')
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
  const upcoming = watch.filter((entry) => entry.phase === 'upcoming').map((entry) => entry.windowStart).sort()
  const stock = summarizeDoxycycline(records.stockLots, today)
  return {
    flood: flood
      ? {
          startedOn: flood.startedOn,
          day: floodDay,
          window: floodDay < WATCH_START_DAY ? 'before' : floodDay > WATCH_END_DAY ? 'over' : 'open',
          windowStart: addDays(flood.startedOn, WATCH_START_DAY),
          windowEnd: addDays(flood.startedOn, WATCH_END_DAY),
          puroks: flood.puroks ?? [],
        }
      : null,
    watch: {
      active: watch.filter((entry) => entry.phase === 'active').length,
      upcoming: watch.filter((entry) => entry.phase === 'upcoming').length,
      higherRisk: watch.filter((entry) => entry.phase === 'active' && entry.higherRisk).length,
      nextStart: upcoming[0] ?? null,
    },
    hingaThisWeek: {
      fast: thisWeek.filter((check) => check.outcome === 'fast').length,
      urgent: thisWeek.filter((check) => check.outcome === 'urgent').length,
      refused: thisWeek.filter((check) => check.outcome === 'refused').length,
      referred: referrals.length,
      lastReferredAt: referrals[0]?.checkedAt ?? null,
    },
    doxycycline: { onHand: stock.capsulesOnHand, expiringSoon: stock.capsulesExpiringSoon, expired: stock.capsulesExpired },
    openFlags: records.flags.filter((flag) => flag.status === 'open').length,
    modelsPrepared,
  }
}
