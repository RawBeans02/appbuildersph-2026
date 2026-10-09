import { isValidCount, MAX_COUNT, suppress, type Count } from './suppress'

// The QR payload v1: de-identified aggregate counts for one barangay and one
// ISO week. No names, birthdates, household IDs, puroks or exact dates: every
// field is a fixed-pattern code, an ISO week or a count, and the validator
// rejects unknown keys and any other text, so nothing else can ride along.

export const SCHEMA_VERSION = 1

// Age bands, half-open: [0, 2 months), [2 months, 12 months), [1 year, 5 years),
// [5, 18), [18, 60), 60 and over.
export const AGE_BANDS = ['under2m', 'm2to12', 'y1to5', 'y5to17', 'y18to59', 'y60plus'] as const
export type AgeBand = (typeof AGE_BANDS)[number]

// The WHO IMCI fast-breathing bands Hinga checks: the first three age bands.
export const HINGA_AGE_BANDS = ['under2m', 'm2to12', 'y1to5'] as const
export type HingaAgeBand = (typeof HINGA_AGE_BANDS)[number]

// Every count in the payload, generic over the value: raw numbers on the
// phone, suppressed counts in the QR, ranges in the merged totals.
export type CountsOf<T> = {
  // Residents logged as exposed to floodwater, by age band.
  exposed: Record<AgeBand, T>
  // Residents currently in the day 5–15 watch window after exposure.
  inWatchWindow: T
  // Hinga "fast breathing for age" referrals, by age band.
  fastBreathing: Record<HingaAgeBand, T>
  // Referrals with a danger sign (URGENT).
  urgentReferrals: T
  // Doxycycline capsules on hand.
  doxyCapsulesOnHand: T
  // Of those, capsules expiring within 6 weeks.
  doxyCapsulesExpiring6w: T
  // Exposure × stock flags for clinician review.
  clinicianReviewFlags: T
}

export type RawCounts = CountsOf<number>
export type Counts = CountsOf<Count>

export type QrPayloadV1 = {
  version: typeof SCHEMA_VERSION
  // Demo municipality code, 3 capital letters or digits, e.g. "SID".
  municipality: string
  // Demo barangay code: the municipality code, a dash, 3 capitals or digits,
  // e.g. "SID-MAL". The key registry maps it to the device's public key.
  barangay: string
  // ISO week, e.g. "2026-W41". Never a date.
  epiWeek: string
  // This device's export number, from 1, one higher on every export. When a
  // barangay sends more than once, the highest number is the newest.
  seq: number
  counts: Counts
}

export const MUNICIPALITY_PATTERN = /^[A-Z0-9]{3}$/
export const BARANGAY_PATTERN = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/
const EPI_WEEK_PATTERN = /^(20\d\d)-W(\d\d)$/

// Number of ISO weeks (52 or 53) in a year: 53 when the year starts on a
// Thursday, or on a Wednesday in a leap year.
export function isoWeeksInYear(year: number): 52 | 53 {
  const dayOfDec31 = (y: number) => (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) % 7
  return dayOfDec31(year) === 4 || dayOfDec31(year - 1) === 3 ? 53 : 52
}

export function isEpiWeek(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = EPI_WEEK_PATTERN.exec(value)
  if (!match) return false
  const week = Number(match[2])
  return week >= 1 && week <= isoWeeksInYear(Number(match[1]))
}

// The ISO week of a date on the device's own calendar, e.g. "2026-W41". The
// week belongs to the year of its Thursday.
export function isoWeek(date: Date): string {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const weekday = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const year = day.getUTCFullYear()
  const week = Math.ceil(((day.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

// The 14 counts in a fixed order (the order of CountsOf's fields, bands in
// AGE_BANDS / HINGA_AGE_BANDS order), and back.
export function flattenCounts<T>(counts: CountsOf<T>): T[] {
  return [
    ...AGE_BANDS.map((band) => counts.exposed[band]),
    counts.inWatchWindow,
    ...HINGA_AGE_BANDS.map((band) => counts.fastBreathing[band]),
    counts.urgentReferrals,
    counts.doxyCapsulesOnHand,
    counts.doxyCapsulesExpiring6w,
    counts.clinicianReviewFlags,
  ]
}

export const COUNT_FIELDS = AGE_BANDS.length + 1 + HINGA_AGE_BANDS.length + 4

export function unflattenCounts<T>(values: readonly T[]): CountsOf<T> {
  if (values.length !== COUNT_FIELDS) throw new RangeError(`expected ${COUNT_FIELDS} counts, got ${values.length}`)
  let i = 0
  const next = () => values[i++]
  const exposed = Object.fromEntries(AGE_BANDS.map((band) => [band, next()])) as Record<AgeBand, T>
  const inWatchWindow = next()
  const fastBreathing = Object.fromEntries(HINGA_AGE_BANDS.map((band) => [band, next()])) as Record<HingaAgeBand, T>
  return {
    exposed,
    inWatchWindow,
    fastBreathing,
    urgentReferrals: next(),
    doxyCapsulesOnHand: next(),
    doxyCapsulesExpiring6w: next(),
    clinicianReviewFlags: next(),
  }
}

export function mapCounts<A, B>(counts: CountsOf<A>, map: (value: A) => B): CountsOf<B> {
  return unflattenCounts(flattenCounts(counts).map(map))
}

// --- Strict validation -------------------------------------------------------

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// Problems are worded without echoing the offending values or unknown key
// names, so a rejected payload's text never ends up in a message or log.
function checkKeys(value: Record<string, unknown>, keys: readonly string[], path: string, problems: string[]) {
  const actual = Object.keys(value)
  const missing = keys.filter((key) => !Object.hasOwn(value, key))
  if (missing.length > 0) problems.push(`${path}: missing ${missing.join(', ')}`)
  if (actual.some((key) => !keys.includes(key))) problems.push(`${path}: has unknown keys`)
}

function checkCounts(
  value: unknown,
  isLeaf: (leaf: unknown) => boolean,
  leafRule: string,
  path: string,
  problems: string[],
) {
  if (!isPlainObject(value)) {
    problems.push(`${path}: not an object`)
    return
  }
  const groups = { exposed: AGE_BANDS, fastBreathing: HINGA_AGE_BANDS } as const
  const singles = ['inWatchWindow', 'urgentReferrals', 'doxyCapsulesOnHand', 'doxyCapsulesExpiring6w', 'clinicianReviewFlags']
  checkKeys(value, [...Object.keys(groups), ...singles], path, problems)
  for (const [group, bands] of Object.entries(groups)) {
    const inner = value[group]
    if (!isPlainObject(inner)) {
      if (Object.hasOwn(value, group)) problems.push(`${path}.${group}: not an object`)
      continue
    }
    checkKeys(inner, bands, `${path}.${group}`, problems)
    for (const band of bands) {
      if (Object.hasOwn(inner, band) && !isLeaf(inner[band])) problems.push(`${path}.${group}.${band}: ${leafRule}`)
    }
  }
  for (const single of singles) {
    if (Object.hasOwn(value, single) && !isLeaf(value[single])) problems.push(`${path}.${single}: ${leafRule}`)
  }
}

export type Validation<T> = { ok: true; value: T } | { ok: false; problems: string[] }

// Checks a payload exactly: no missing or unknown keys at any level, codes and
// week in their fixed patterns, and every count already suppressed (0, "<5" or
// 5 to MAX_COUNT; an exact 1 to 4 is rejected).
export function validatePayload(value: unknown): Validation<QrPayloadV1> {
  const problems: string[] = []
  if (!isPlainObject(value)) return { ok: false, problems: ['payload: not an object'] }
  checkKeys(value, ['version', 'municipality', 'barangay', 'epiWeek', 'seq', 'counts'], 'payload', problems)
  if (value.version !== SCHEMA_VERSION) problems.push(`version: must be ${SCHEMA_VERSION}`)
  const { municipality, barangay } = value
  const municipalityOk = typeof municipality === 'string' && MUNICIPALITY_PATTERN.test(municipality)
  if (!municipalityOk) problems.push('municipality: must be 3 capital letters or digits')
  if (typeof barangay !== 'string' || !BARANGAY_PATTERN.test(barangay)) {
    problems.push('barangay: must be the municipality code, a dash and 3 capital letters or digits')
  } else if (municipalityOk && !barangay.startsWith(`${municipality}-`)) {
    problems.push('barangay: does not belong to the municipality')
  }
  if (!isEpiWeek(value.epiWeek)) problems.push('epiWeek: must be an ISO week like 2026-W41')
  const { seq } = value
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1 || seq > MAX_COUNT) {
    problems.push(`seq: must be a whole number from 1 to ${MAX_COUNT}`)
  }
  checkCounts(value.counts, isValidCount, `must be 0, "<5" or a whole number from 5 to ${MAX_COUNT}`, 'counts', problems)
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: value as QrPayloadV1 }
}

export type PayloadInput = {
  municipality: string
  barangay: string
  epiWeek: string
  seq: number
  // Raw counts from the phone's records; suppressed here before anything else.
  counts: RawCounts
}

// Builds a payload from raw counts: checks their shape (no extra keys, whole
// numbers), suppresses every count, then validates the result. Throws a
// RangeError listing the problems.
export function createPayload(input: PayloadInput): QrPayloadV1 {
  const problems: string[] = []
  const isRaw = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_COUNT
  checkCounts(input.counts, isRaw, `must be a whole number from 0 to ${MAX_COUNT}`, 'counts', problems)
  if (problems.length > 0) throw new RangeError(`invalid counts: ${problems.join('; ')}`)
  const result = validatePayload({
    version: SCHEMA_VERSION,
    municipality: input.municipality,
    barangay: input.barangay,
    epiWeek: input.epiWeek,
    seq: input.seq,
    counts: mapCounts(input.counts, suppress),
  })
  if (!result.ok) throw new RangeError(`invalid payload: ${result.problems.join('; ')}`)
  return result.value
}
