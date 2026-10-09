import type { StockLot } from '../data/db/types'
import { addDays, daysBetween } from './dates'
import { watchedCount, type WatchEntry } from './watch'

// Exposure × stock: how many residents are being watched next to how much
// doxycycline is on hand and how much of it expires soon. These are counts
// and facts for a clinician to review; nothing here suggests or computes a
// dose (DOH: doxycycline only after consultation with a health professional).

export const EXPIRING_WITHIN_DAYS = 42

// A lot labeled with an expiry month is usable through that month's last day.
export function lastDayOfMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

export const isDoxycycline = (drug: string) => /doxy/i.test(drug)

export type LotStatus = 'ok' | 'expiring' | 'expired'

// Expired once its expiry month has ended. Expiring once its expiry month
// starts within 6 weeks: the alert errs early, so a lot marked EXP 11/2026
// counts as expiring from mid-October.
export function lotStatus(expiry: string, today: string): LotStatus {
  if (daysBetween(today, lastDayOfMonth(expiry)) < 0) return 'expired'
  return `${expiry}-01` <= addDays(today, EXPIRING_WITHIN_DAYS) ? 'expiring' : 'ok'
}

export type StockSummary = {
  // Capsules not yet expired (including the ones expiring soon).
  capsulesOnHand: number
  // Of those, capsules whose expiry month starts within 6 weeks.
  capsulesExpiringSoon: number
  // Capsules past expiry: to set aside, not counted as on hand.
  capsulesExpired: number
  lots: (StockLot & { status: LotStatus })[]
}

export function summarizeDoxycycline(lots: StockLot[], today: string): StockSummary {
  const doxy = lots
    .filter((lot) => isDoxycycline(lot.drug) && lot.unit === 'capsule')
    .map((lot) => ({ ...lot, status: lotStatus(lot.expiry, today) }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry))
  const sum = (status: LotStatus[]) =>
    doxy.filter((lot) => status.includes(lot.status)).reduce((total, lot) => total + lot.quantity, 0)
  return {
    capsulesOnHand: sum(['ok', 'expiring']),
    capsulesExpiringSoon: sum(['expiring']),
    capsulesExpired: sum(['expired']),
    lots: doxy,
  }
}

export type ExposureStockReview = {
  // Residents in or about to enter their watch window.
  exposed: number
  higherRisk: number
  stock: StockSummary
  // A clinician should review whenever anyone is being watched.
  needsReview: boolean
  // Plain facts for the flag, in order.
  reasons: string[]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function reviewExposureStock(watch: WatchEntry[], lots: StockLot[], today: string): ExposureStockReview {
  const watched = watch.filter((entry) => entry.phase !== 'ended')
  const exposed = watchedCount(watch)
  const stock = summarizeDoxycycline(lots, today)
  const reasons: string[] = []
  if (exposed > 0) reasons.push(`${plural(exposed, 'resident is', 'residents are')} in or near the leptospirosis watch window`)
  if (exposed > 0 && stock.capsulesOnHand === 0) reasons.push('No usable doxycycline capsules on hand')
  if (stock.capsulesExpiringSoon > 0) {
    reasons.push(`${plural(stock.capsulesExpiringSoon, 'doxycycline capsule expires', 'doxycycline capsules expire')} within 6 weeks`)
  }
  if (stock.capsulesExpired > 0) {
    reasons.push(`${plural(stock.capsulesExpired, 'capsule is', 'capsules are')} past expiry: set aside`)
  }
  return {
    exposed,
    higherRisk: watched.filter((entry) => entry.higherRisk).length,
    stock,
    needsReview: exposed > 0,
    reasons,
  }
}
