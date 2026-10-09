import type { Exposure, Flag, HingaCheck, HingaOutcome, Resident, StockLot } from '../../data/db/types'
import { AGE_BANDS, HINGA_AGE_BANDS, isoWeek, type AgeBand, type HingaAgeBand, type RawCounts } from '../../qr'
import { summarizeDoxycycline } from '../../rules/stock'
import { watchList } from '../../rules/watch'

// The raw counts for the de-identified QR, from this phone's records. Only
// counts leave the phone; src/qr suppresses 1-4 to "<5" before encoding.

export function ageInMonths(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0)
}

// Half-open bands, as src/qr/schema.ts defines them.
export function ageBand(months: number): AgeBand {
  if (months < 2) return 'under2m'
  if (months < 12) return 'm2to12'
  if (months < 60) return 'y1to5'
  if (months < 18 * 12) return 'y5to17'
  if (months < 60 * 12) return 'y18to59'
  return 'y60plus'
}

// The WHO IMCI fast-breathing bands; null for anyone 5 or older.
export function hingaBand(months: number): HingaAgeBand | null {
  const band = ageBand(months)
  return (HINGA_AGE_BANDS as readonly string[]).includes(band) ? (band as HingaAgeBand) : null
}

const zeroBands = <B extends string>(bands: readonly B[]) =>
  Object.fromEntries(bands.map((band) => [band, 0])) as Record<B, number>

export type PhoneRecords = {
  residents: Resident[]
  exposures: Exposure[]
  hingaChecks: HingaCheck[]
  stockLots: StockLot[]
  flags: Flag[]
}

const localDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const SEVERITY: Record<HingaOutcome, number> = { urgent: 3, fast: 2, 'not-fast': 1, refused: 0 }

// One referral per child per week: a linked resident checked again and again
// (5 fast checks of one child) counts once, by their most severe result that
// week (urgent > fast > not fast), so repeat checks can't inflate the referrals
// or change the municipal priority. A check with no linked resident can't be
// matched to any other check, so it still counts once on its own.
function referralsOf(checks: readonly HingaCheck[]): HingaCheck[] {
  const byResident = new Map<string, HingaCheck>()
  const unlinked: HingaCheck[] = []
  for (const check of checks) {
    if (!check.residentId) {
      unlinked.push(check)
      continue
    }
    const kept = byResident.get(check.residentId)
    if (!kept || SEVERITY[check.outcome] > SEVERITY[kept.outcome]) byResident.set(check.residentId, check)
  }
  return [...byResident.values(), ...unlinked]
}

export function collectRawCounts(records: PhoneRecords, today: string): RawCounts {
  const residents = new Map(records.residents.map((resident) => [resident.id, resident]))
  const watch = watchList(records.exposures, today)

  // Exposed, by age band today: only residents whose watch hasn't started yet
  // (window upcoming). Everyone in the window is counted once, in
  // inWatchWindow, and never in a band as well: if the two overlapped, a "<5"
  // band could be worked out as inWatchWindow minus the exact bands.
  const exposed = zeroBands(AGE_BANDS)
  for (const entry of watch) {
    if (entry.phase !== 'upcoming') continue
    const resident = residents.get(entry.residentId)
    if (resident) exposed[ageBand(ageInMonths(resident.birthDate, today))] += 1
  }

  // Hinga referrals from this ISO week. An URGENT result (a danger sign, or
  // fast breathing under 2 months) counts as URGENT only; a plain fast result
  // counts by age band.
  const week = isoWeek(localDate(today))
  const thisWeek = referralsOf(records.hingaChecks.filter((check) => isoWeek(new Date(check.checkedAt)) === week))
  const fastBreathing = zeroBands(HINGA_AGE_BANDS)
  for (const check of thisWeek) {
    const band = hingaBand(check.ageMonths)
    if (check.outcome === 'fast' && band) fastBreathing[band] += 1
  }

  const stock = summarizeDoxycycline(records.stockLots, today)
  return {
    exposed,
    inWatchWindow: watch.filter((entry) => entry.phase === 'active').length,
    fastBreathing,
    urgentReferrals: thisWeek.filter((check) => check.outcome === 'urgent').length,
    doxyCapsulesOnHand: stock.capsulesOnHand,
    doxyCapsulesExpiring6w: stock.capsulesExpiringSoon,
    clinicianReviewFlags: records.flags.filter((flag) => flag.status === 'open').length,
  }
}
