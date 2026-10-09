// Crying changes a child's breathing, so a count taken while the child cries
// means nothing. YAMNet (an on-device audio classifier) listens during the
// count only; when it hears crying for long enough, the count is refused.
// The microphone audio is classified in ~1 s pieces and dropped: never
// recorded, stored or sent.

// YAMNet's two crying classes (AudioSet names, indices 19 and 20).
export const CRY_LABELS = ['Crying, sobbing', 'Baby cry, infant cry'] as const

// First settings, not measured on real crying: a window counts as crying when
// either class scores above CRY_SCORE_THRESHOLD, and the count is refused when
// more than CRY_MIN_SECONDS of the minute were crying.
export const CRY_SCORE_THRESHOLD = 0.3
export const CRY_MIN_SECONDS = 3

export type CryWindow = {
  // Seconds of audio this window covers.
  durationS: number
  // The higher of the two crying scores, 0 to 1.
  score: number
}

export function cryScore(categories: readonly { categoryName: string; score: number }[]): number {
  let best = 0
  for (const category of categories) {
    if ((CRY_LABELS as readonly string[]).includes(category.categoryName)) best = Math.max(best, category.score)
  }
  return best
}

export function cryingSeconds(windows: readonly CryWindow[], threshold = CRY_SCORE_THRESHOLD): number {
  return windows.reduce((sum, window) => (window.score > threshold ? sum + window.durationS : sum), 0)
}

export function cryDetected(
  windows: readonly CryWindow[],
  threshold = CRY_SCORE_THRESHOLD,
  minSeconds = CRY_MIN_SECONDS,
): boolean {
  return cryingSeconds(windows, threshold) > minSeconds
}

// After a count: whether crying was heard, or why the cry check can't vouch
// for the count (it never started, heard nothing, or missed part of the
// minute). A count with the check off still stands, labeled "Cry check off".
export type CryVerdict = { crying: boolean; off: string | null }

export function cryVerdict(input: {
  // Why the check didn't listen at all (e.g. microphone not allowed), or null.
  offReason: string | null
  windows: readonly CryWindow[]
  // Pieces of audio the model failed to score.
  failed: number
}): CryVerdict {
  if (input.offReason !== null) return { crying: false, off: input.offReason }
  if (cryDetected(input.windows)) return { crying: true, off: null }
  if (input.windows.length === 0) return { crying: false, off: 'no sound was checked' }
  if (input.failed > 0) return { crying: false, off: "part of the sound wasn't checked" }
  return { crying: false, off: null }
}
