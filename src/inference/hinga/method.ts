import type { Box } from './roi'

// How Hinga gets a breathing signal from the camera. The signal processing
// (dsp.ts) and the screens don't depend on the method: a method finds the
// region to count on, and gives each frame one or more named signals.
//   'pose-torso': MediaPipe pose landmarks find the torso; the signals are the
//     torso's brightness and the shoulder height (the S1 spike's method, now in
//     the phone trials).
//   'tap-region': fallback 1 if S1 fails. The health worker taps the chest;
//     frame differencing follows that region (docs/SPIKE-HINGA.md). Not built.
export type CountMethodId = 'pose-torso' | 'tap-region'

// Set after the S1 kill call (7:00 PM).
export const COUNT_METHOD: CountMethodId = 'pose-torso'

export type MethodInfo = {
  // Measured on this device: the time to load and start the models.
  loadMs: number
  // Where the model runs, e.g. 'worker' or 'main-thread'.
  where: string
  // Why it runs somewhere other than planned, or null.
  note: string | null
}

export type FrameMeasure = {
  // The region found this frame (for framing and the quality gate); null when not found.
  region: Box | null
  // Named breathing signals for this frame; empty while framing.
  signals: Record<string, number | null>
  // Points to draw on the overlay (e.g. the shoulders), normalized.
  points: { x: number; y: number }[]
  // Measured: the model's time for this frame.
  inferMs: number
}

export type CountMethod = {
  id: CountMethodId
  start(): Promise<MethodInfo>
  // One video frame. `locked` is the region fixed when the count started; null while framing.
  measure(video: HTMLVideoElement, timestampMs: number, locked: Box | null): Promise<FrameMeasure>
  dispose(): void
}
