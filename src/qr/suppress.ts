// Small-cell suppression for the de-identified QR.
//
// A count of 1 to 4 people could point to a household, so it leaves the phone
// only as the sentinel "<5". Zero stays 0 (nobody to identify) and 5 or more
// stays exact. Because 0 is never suppressed, "<5" always means 1 to 4.
//
// Sums: a total that includes "<5" cells is a range, never a guess. k
// sentinels plus an exact part E give E + k to E + 4k, shown as "13–16".

export const SUPPRESSED = '<5'
export type Suppressed = typeof SUPPRESSED

// One count as it travels in the QR: 0, an exact number >= 5, or "<5".
export type Count = number | Suppressed

// Upper bound for any count or sequence number. A sanity limit that keeps
// every QR small, not a statistic.
export const MAX_COUNT = 999_999

// The smallest count that is sent exactly (counts 1..SMALL_CELL_LIMIT - 1 are
// suppressed).
export const SMALL_CELL_LIMIT = 5

export function isSuppressed(count: Count): count is Suppressed {
  return count === SUPPRESSED
}

function isCountNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_COUNT
}

// Suppresses one raw count. Throws a RangeError for anything that isn't a
// whole number from 0 to MAX_COUNT.
export function suppress(n: number): Count {
  if (!isCountNumber(n)) throw new RangeError(`count must be a whole number from 0 to ${MAX_COUNT}, got ${n}`)
  return n > 0 && n < SMALL_CELL_LIMIT ? SUPPRESSED : n
}

// True for a value that may appear in a QR: 0, a whole number from 5 to
// MAX_COUNT, or "<5". An exact 1 to 4 is not a valid suppressed count.
export function isValidCount(value: unknown): value is Count {
  if (value === SUPPRESSED) return true
  return isCountNumber(value) && (value === 0 || value >= SMALL_CELL_LIMIT)
}

// What a count or a sum of counts can be: min === max when it's exact.
export type CountRange = { readonly min: number; readonly max: number }

export function countRange(count: Count): CountRange {
  return isSuppressed(count) ? { min: 1, max: SMALL_CELL_LIMIT - 1 } : { min: count, max: count }
}

export function sumCounts(counts: readonly Count[]): CountRange {
  let min = 0
  let max = 0
  for (const count of counts) {
    const range = countRange(count)
    min += range.min
    max += range.max
  }
  return { min, max }
}

export function isExact(range: CountRange): boolean {
  return range.min === range.max
}

// "0", "12" or "<5": one cell as it was sent.
export function formatCount(count: Count): string {
  return isSuppressed(count) ? SUPPRESSED : String(count)
}

// "12" when exact, "13–16" (en dash) when the sum includes "<5" cells.
export function formatRange(range: CountRange): string {
  return isExact(range) ? String(range.min) : `${range.min}–${range.max}`
}
