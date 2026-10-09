// L8b, counting by hand: the WHO IMCI method health workers are trained in.
// They watch the chest and tap once per breath; the app keeps the 60 s and
// applies the age cut-off (imci.ts). Pure functions over tap times, so the
// screen only renders them.
//
// The clock starts at the first tap, so no breath is lost while the health
// worker reads the screen and finds the chest: a late start can only count
// fewer breaths, and an undercount near the cut-off would miss fast breathing.
// With a tap on every breath, a steady rate of r a minute gives ceil(r) taps
// in the minute that starts at a breath (exactly r when r is whole).

export const HAND_COUNT_MS = 60_000

export type HandCount = {
  // When the first tap started the clock (ms, e.g. performance.now()).
  startedAt: number | null
  // Every counted tap, the first one included.
  taps: number
}

export const NOT_STARTED: HandCount = { startedAt: null, taps: 0 }

export function isDone(count: HandCount, now: number): boolean {
  return count.startedAt !== null && now - count.startedAt >= HAND_COUNT_MS
}

// One tap: starts the clock on the first, counts the rest until the minute is
// up, and ignores taps after it.
export function tap(count: HandCount, now: number): HandCount {
  if (count.startedAt === null) return { startedAt: now, taps: 1 }
  if (isDone(count, now)) return count
  return { startedAt: count.startedAt, taps: count.taps + 1 }
}

export function msLeft(count: HandCount, now: number): number {
  if (count.startedAt === null) return HAND_COUNT_MS
  return Math.max(0, HAND_COUNT_MS - (now - count.startedAt))
}

// Breaths a minute: the taps in the full 60 s. null until the minute is up.
export function handRate(count: HandCount, now: number): number | null {
  return isDone(count, now) ? count.taps : null
}

// The countdown as m:ss, rounded up so it reads 0:00 only when time is up
// (60 s → "1:00", 41.2 s → "0:42").
export function clockText(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
