// The camera decode loop. One frame at a time: the next decode starts
// `intervalMs` after the previous one finished, so a slow decoder never piles
// up work, and the laptop's other jobs keep their CPU.
//
// A QR held in front of the camera is seen many times. Its text is reported
// once, and again only after it has been out of view for `repeatAfterMs`
// (taken away and shown again), so one scan gives one result.

export const SCAN_INTERVAL_MS = 250
export const REPEAT_AFTER_MS = 3000

type Timer = unknown

export type ScanLoopOptions = {
  decodeFrame: () => Promise<string | null>
  onText: (text: string) => void
  onError?: (error: unknown) => void
  intervalMs?: number
  repeatAfterMs?: number
  // Injected in tests.
  now?: () => number
  setTimer?: (run: () => void, ms: number) => Timer
  clearTimer?: (timer: Timer) => void
}

// Starts decoding; returns stop().
export function startScanLoop(options: ScanLoopOptions): () => void {
  const {
    decodeFrame,
    onText,
    onError,
    intervalMs = SCAN_INTERVAL_MS,
    repeatAfterMs = REPEAT_AFTER_MS,
    now = () => Date.now(),
    setTimer = (run, ms) => setTimeout(run, ms),
    clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  } = options
  let stopped = false
  let timer: Timer | null = null
  let lastText: string | null = null
  let lastSeenAt = -Infinity

  async function tick() {
    timer = null
    if (stopped) return
    try {
      const text = await decodeFrame()
      if (stopped) return
      if (text) {
        const at = now()
        if (text !== lastText || at - lastSeenAt >= repeatAfterMs) onText(text)
        lastText = text
        lastSeenAt = at
      }
    } catch (error) {
      if (stopped) return
      onError?.(error)
    }
    if (!stopped) timer = setTimer(() => void tick(), intervalMs)
  }

  void tick()
  return () => {
    stopped = true
    if (timer !== null) clearTimer(timer)
  }
}
