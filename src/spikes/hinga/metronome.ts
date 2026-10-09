// A breathing metronome for the trials: a visual cue and, optionally, a high
// beep at the start of each breath in and a low beep at the start of each
// breath out. Start it from a tap: browsers only allow sound after a gesture.

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } }

export type Metronome = {
  start(perMin: number, sound: boolean): Promise<void>
  stop(): void
  isRunning(): boolean
}

// onPhase gets the position in the breath cycle, 0 to 1 (0 = start of the
// breath in, 0.5 = start of the breath out), once per animation frame.
export function createMetronome(onPhase: (phase: number) => void): Metronome {
  let ctx: AudioContext | null = null
  let raf = 0
  let timer = 0
  let running = false
  let periodS = 1
  let startMs = 0 // performance.now() at the first breath in
  let audioStart = 0 // AudioContext time of the first breath in
  let nextHalf = 0 // next half-cycle to schedule a beep for

  function beep(at: number, hz: number) {
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.4, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15)
    osc.connect(gain).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + 0.16)
  }

  // Look-ahead scheduling on the audio clock keeps the beeps evenly spaced
  // even when the page is busy.
  function schedule() {
    if (!ctx) return
    const horizon = ctx.currentTime + 0.25
    for (let at = audioStart + (nextHalf * periodS) / 2; at < horizon; at = audioStart + (nextHalf * periodS) / 2) {
      beep(at, nextHalf % 2 === 0 ? 880 : 440)
      nextHalf++
    }
  }

  function frame() {
    const cycles = (performance.now() - startMs) / 1000 / periodS
    onPhase(((cycles % 1) + 1) % 1)
    raf = requestAnimationFrame(frame)
  }

  function stop() {
    running = false
    cancelAnimationFrame(raf)
    clearInterval(timer)
    void ctx?.suspend()
  }

  return {
    async start(perMin, sound) {
      stop()
      periodS = 60 / perMin
      running = true
      startMs = performance.now()
      if (sound) {
        // iPhone: play through the ring/silent switch (Safari 17 and later).
        const session = (navigator as AudioSessionNavigator).audioSession
        if (session) session.type = 'playback'
        ctx ??= new AudioContext()
        await ctx.resume()
        audioStart = ctx.currentTime + 0.1
        startMs = performance.now() + 100
        nextHalf = 0
        schedule()
        timer = window.setInterval(schedule, 50)
      }
      raf = requestAnimationFrame(frame)
    },
    stop,
    isRunning: () => running,
  }
}
