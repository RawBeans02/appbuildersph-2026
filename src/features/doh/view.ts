import { AGE_BANDS, formatCount, formatRange, HINGA_AGE_BANDS, sumCounts, type CountRange, type Counts, type CountsOf } from '../../qr'
import { VIEW_CODE_HEADER, type ReportsResponse } from '../../../server/protocol'
import { addRanges, formatReceivedAt, nameOf } from '../municipal/counts'
import { callApi, type ApiResult, type Fetcher } from '../municipal/sync/client'

// The DOH view's data: the latest report per barangay from GET /api/reports,
// shown as sent. A single cell keeps "<5"; a cell that adds age bands, and
// every total, is a range (exact when no "<5" went in), as on the laptop.

export type DohCells = {
  exposed: string
  inWatchWindow: string
  fastBreathing: string
  urgentReferrals: string
  doxyOnHand: string
  doxyExpiring: string
  flags: string
}

export type DohRow = {
  barangay: string
  name: string
  week: string
  // Not the newest week: left out of the totals.
  olderWeek: boolean
  cells: DohCells
  received: string
  from: string
}

export type DohView = {
  rows: DohRow[]
  totals: { week: string; barangays: number; cells: DohCells } | null
}

export function rowCells(counts: Counts): DohCells {
  return {
    exposed: formatRange(sumCounts(AGE_BANDS.map((band) => counts.exposed[band]))),
    inWatchWindow: formatCount(counts.inWatchWindow),
    fastBreathing: formatRange(sumCounts(HINGA_AGE_BANDS.map((band) => counts.fastBreathing[band]))),
    urgentReferrals: formatCount(counts.urgentReferrals),
    doxyOnHand: formatCount(counts.doxyCapsulesOnHand),
    doxyExpiring: formatCount(counts.doxyCapsulesExpiring6w),
    flags: formatCount(counts.clinicianReviewFlags),
  }
}

export function totalCells(totals: CountsOf<CountRange>): DohCells {
  return {
    exposed: formatRange(addRanges(AGE_BANDS.map((band) => totals.exposed[band]))),
    inWatchWindow: formatRange(totals.inWatchWindow),
    fastBreathing: formatRange(addRanges(HINGA_AGE_BANDS.map((band) => totals.fastBreathing[band]))),
    urgentReferrals: formatRange(totals.urgentReferrals),
    doxyOnHand: formatRange(totals.doxyCapsulesOnHand),
    doxyExpiring: formatRange(totals.doxyCapsulesExpiring6w),
    flags: formatRange(totals.clinicianReviewFlags),
  }
}

export function dohView(response: ReportsResponse, now = new Date()): DohView {
  const newest = response.totals?.epiWeek ?? null
  return {
    rows: response.rows.map((row) => ({
      barangay: row.barangay,
      name: nameOf(row.barangay),
      week: row.epiWeek,
      olderWeek: row.epiWeek !== newest,
      cells: rowCells(row.counts),
      received: formatReceivedAt(row.receivedAt, now),
      from: row.receivedFrom,
    })),
    totals: response.totals
      ? { week: response.totals.epiWeek, barangays: response.totals.barangays, cells: totalCells(response.totals.counts) }
      : null,
  }
}

export function fetchReports(code: string, municipality: string, fetcher: Fetcher = fetch): Promise<ApiResult<ReportsResponse>> {
  return callApi<ReportsResponse>(fetcher, `/api/reports?municipality=${encodeURIComponent(municipality)}`, {
    method: 'GET',
    headers: { [VIEW_CODE_HEADER]: code },
  })
}

// The view code lives in this tab's sessionStorage only: gone when the tab
// closes, never in localStorage, a cookie or the URL.
const CODE_KEY = 'agapay-doh-view-code'

export const savedCode = {
  get(): string | null {
    try {
      return sessionStorage.getItem(CODE_KEY)
    } catch {
      return null
    }
  },
  set(code: string): void {
    try {
      sessionStorage.setItem(CODE_KEY, code)
    } catch {
      // Storage off (a private window): the code is asked again next time.
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(CODE_KEY)
    } catch {
      // Nothing to clear.
    }
  },
}
