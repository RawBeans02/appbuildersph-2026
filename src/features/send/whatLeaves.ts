import {
  AGE_BANDS,
  HINGA_AGE_BANDS,
  formatCount,
  isoWeek,
  suppress,
  type AgeBand,
  type Count,
  type Counts,
  type QrPayloadV1,
  type RawCounts,
} from '../../qr'

// Screen 14a's "What leaves this phone": the 14 counts of the QR, already
// suppressed, in the order and wording of design/COPY.md.

// WHO IMCI wording (design/README.md, pass 1 review decision 1).
export const BAND_LABELS: Record<AgeBand, string> = {
  under2m: 'Under 2 months',
  m2to12: '2 up to 12 months',
  y1to5: '12 months up to 5 years',
  y5to17: '5 to 17 years',
  y18to59: '18 to 59 years',
  y60plus: '60 and over',
}

// The exposed bands count only residents whose watch hasn't started yet (see
// collectRawCounts), as COPY.md 14a words it.
export const EXPOSED_HEADING = 'Exposed, watch not started yet, by age'

export type CountRow = { label: string; value: string }

// A group of age-band rows under a heading, or one row on its own (heading null).
export type CountSection = { heading: string | null; rows: CountRow[] }

const suppressBands = <B extends string>(bands: readonly B[], values: Record<B, number>) =>
  Object.fromEntries(bands.map((band) => [band, suppress(values[band])])) as Record<B, Count>

// The counts as the QR will carry them: 1 to 4 become "<5".
export function suppressCounts(raw: RawCounts): Counts {
  return {
    exposed: suppressBands(AGE_BANDS, raw.exposed),
    inWatchWindow: suppress(raw.inWatchWindow),
    fastBreathing: suppressBands(HINGA_AGE_BANDS, raw.fastBreathing),
    urgentReferrals: suppress(raw.urgentReferrals),
    doxyCapsulesOnHand: suppress(raw.doxyCapsulesOnHand),
    doxyCapsulesExpiring6w: suppress(raw.doxyCapsulesExpiring6w),
    clinicianReviewFlags: suppress(raw.clinicianReviewFlags),
  }
}

export function whatLeaves(counts: Counts): CountSection[] {
  const row = (label: string, count: Count): CountRow => ({ label, value: formatCount(count) })
  const single = (label: string, count: Count): CountSection => ({ heading: null, rows: [row(label, count)] })
  return [
    {
      heading: EXPOSED_HEADING,
      rows: AGE_BANDS.map((band) => row(BAND_LABELS[band], counts.exposed[band])),
    },
    single('In the watch window now', counts.inWatchWindow),
    {
      heading: 'Fast-breathing referrals, by age',
      rows: HINGA_AGE_BANDS.map((band) => row(BAND_LABELS[band], counts.fastBreathing[band])),
    },
    single('URGENT referrals', counts.urgentReferrals),
    single('Doxycycline capsules on hand', counts.doxyCapsulesOnHand),
    single('Of those, expiring within 6 weeks', counts.doxyCapsulesExpiring6w),
    single('Flags for clinician review', counts.clinicianReviewFlags),
  ]
}

const shownValues = (counts: Counts) =>
  whatLeaves(counts)
    .flatMap((section) => section.rows.map((row) => row.value))
    .join('|')

// The export made earlier on this visit, if it still says exactly what the
// table shows (same week, same counts), so showing the QR again doesn't use up
// a new export number; otherwise null, and a new export is made.
export function reusableExport<T extends { payload: QrPayloadV1 }>(previous: T | null, week: string, counts: Counts): T | null {
  if (!previous || previous.payload.epiWeek !== week) return null
  return shownValues(previous.payload.counts) === shownValues(counts) ? previous : null
}

// The ISO week of a YYYY-MM-DD day on this device's calendar.
export function weekOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return isoWeek(new Date(y, m - 1, d))
}
