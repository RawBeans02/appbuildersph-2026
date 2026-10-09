import type { Box } from './roi'

// Breathing rate from per-frame camera signals. Pure functions, no DOM.
//
// Method, per signal: resample the frames to a fixed rate, remove the linear
// trend, band-pass to the breathing band, then
//   1. take the spectral peak of a Welch average over sliding 30 s windows, and
//   2. confirm it with a zero-crossing count over the whole recording.
// A count is reported only when the two agree within AGREEMENT_PER_MIN and the
// peak is clear (MIN_PROMINENCE) and steady across windows. Before
// any of that, a quality gate refuses recordings where the region was lost or
// moved too much. Of the candidate signals, the one with the most prominent
// spectral peak is used.
//
// Method-agnostic: a count method (method.ts) gives each frame a region box and
// any named signals (the pose method: chest brightness and shoulder height).
// Started as a copy of the S1 spike's src/spikes/hinga/dsp.ts, which stays as
// it is while the phone trials run. The thresholds are first settings, set
// against synthetic signals in the tests; the trials (docs/SPIKE-HINGA.md)
// decide them.

export const SAMPLE_RATE_HZ = 10
export const BAND_LOW_HZ = 0.2 // 12 breaths per minute
export const BAND_HIGH_HZ = 1.7 // 102 breaths per minute
export const WINDOW_S = 30
export const HOP_S = 5
export const AGREEMENT_PER_MIN = 3
// Share of the in-band power within ±2 bins of a 30 s window around the peak.
// Set above what white and random-walk noise reach in the unit tests.
export const MIN_PROMINENCE = 0.6
// The peaks of the sliding 30 s windows must stay within this range.
export const MAX_WINDOW_SPREAD_PER_MIN = 6
// Zero-crossing hysteresis, as a fraction of the filtered signal's standard deviation.
export const HYSTERESIS = 0.3

// Quality gate.
export const MIN_DURATION_S = 50
export const MIN_FPS = 5
export const MAX_GAP_MS = 1000
export const MAX_LOST_FRACTION = 0.2
// A frame has moved when the torso box centre is more than this share of the
// box's width or height away from its median position, or the box's width or
// height changed by more than SCALE_LIMIT.
export const MOVE_LIMIT = 0.15
export const SCALE_LIMIT = 0.25
export const MAX_MOVED_FRACTION = 0.1

export type Frame = {
  // Milliseconds, increasing (performance.now()).
  t: number
  // The counted region this frame (the torso box for the pose method),
  // normalized; null when it wasn't found. The quality gate uses it.
  box: Box | null
  // The candidate breathing signals, by name; null where a frame has no value.
  signals: Record<string, number | null>
}

export type SignalName = string

export type SignalResult = {
  name: SignalName
  fftPerMin: number
  zcPerMin: number
  prominence: number
  // The spectral peak of each 30 s window, for the log.
  windowPeaksPerMin: number[]
}

export type GateStats = {
  durationS: number
  fps: number
  maxGapMs: number
  lostFraction: number
  movedFraction: number
  // Largest torso box shift seen, as a share of the box size.
  maxShift: number
}

export type Refusal =
  | 'too-few-frames' // too short, too slow, or the camera paused
  | 'no-torso' // torso lost in more than MAX_LOST_FRACTION of frames
  | 'motion' // the torso box moved too much
  | 'no-rhythm' // no clear peak in the breathing band
  | 'disagree' // the spectral peak and the zero-crossing count disagree, or the 30 s windows do

export type Analysis =
  | { ok: true; perMin: number; gate: GateStats; signals: SignalResult[]; chosen: SignalResult }
  | { ok: false; refusal: Refusal; gate: GateStats; signals: SignalResult[]; chosen: SignalResult | null }

// ---------------------------------------------------------------------------
// Signal processing building blocks

// Linear interpolation of (times, values) onto a uniform grid starting at
// startMs. Points outside the known range take the nearest known value.
// Non-finite values are skipped.
export function resample(
  times: readonly number[],
  values: readonly number[],
  rateHz: number,
  startMs: number,
  endMs: number,
): Float64Array {
  const ts: number[] = []
  const vs: number[] = []
  for (let i = 0; i < times.length; i++) {
    if (Number.isFinite(values[i]) && Number.isFinite(times[i])) {
      ts.push(times[i])
      vs.push(values[i])
    }
  }
  const n = Math.max(0, Math.floor(((endMs - startMs) / 1000) * rateHz) + 1)
  const out = new Float64Array(n)
  if (ts.length === 0) return out
  let j = 0
  for (let k = 0; k < n; k++) {
    const t = startMs + (k * 1000) / rateHz
    while (j < ts.length - 2 && ts[j + 1] < t) j++
    if (t <= ts[0]) out[k] = vs[0]
    else if (t >= ts[ts.length - 1]) out[k] = vs[vs.length - 1]
    else {
      const t0 = ts[j]
      const t1 = ts[j + 1]
      out[k] = t1 === t0 ? vs[j + 1] : vs[j] + ((vs[j + 1] - vs[j]) * (t - t0)) / (t1 - t0)
    }
  }
  return out
}

// Subtracts the least-squares straight line.
export function detrend(x: Float64Array): Float64Array {
  const n = x.length
  const out = new Float64Array(n)
  if (n === 0) return out
  const meanI = (n - 1) / 2
  let meanX = 0
  for (let i = 0; i < n; i++) meanX += x[i]
  meanX /= n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - meanI) * (x[i] - meanX)
    den += (i - meanI) ** 2
  }
  const slope = den ? num / den : 0
  for (let i = 0; i < n; i++) out[i] = x[i] - meanX - slope * (i - meanI)
  return out
}

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number }

// Second-order Butterworth sections (bilinear transform, RBJ Audio EQ Cookbook).
function biquad(kind: 'lowpass' | 'highpass', cutoffHz: number, fs: number): Biquad {
  const w0 = (2 * Math.PI * cutoffHz) / fs
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2)
  const a0 = 1 + alpha
  const b0 = kind === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2
  const b1 = kind === 'lowpass' ? 1 - cos : -(1 + cos)
  return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 }
}

// One pass, starting from the steady state for a constant input of x[0].
function runBiquad(f: Biquad, x: Float64Array): Float64Array {
  const out = new Float64Array(x.length)
  if (x.length === 0) return out
  const gain = (f.b0 + f.b1 + f.b2) / (1 + f.a1 + f.a2)
  const y0 = gain * x[0]
  let z2 = f.b2 * x[0] - f.a2 * y0
  let z1 = f.b1 * x[0] - f.a1 * y0 + z2
  for (let i = 0; i < x.length; i++) {
    const y = f.b0 * x[i] + z1
    z1 = f.b1 * x[i] - f.a1 * y + z2
    z2 = f.b2 * x[i] - f.a2 * y
    out[i] = y
  }
  return out
}

// Zero-phase band-pass: high-pass then low-pass, run forwards and backwards,
// with odd reflection padding at both ends to tame edge transients.
export function bandpass(x: Float64Array, fs: number, lowHz = BAND_LOW_HZ, highHz = BAND_HIGH_HZ): Float64Array {
  const n = x.length
  if (n < 3) return new Float64Array(n)
  const pad = Math.min(n - 1, Math.round((3 * fs) / lowHz))
  const padded = new Float64Array(n + 2 * pad)
  for (let i = 0; i < pad; i++) {
    padded[i] = 2 * x[0] - x[pad - i]
    padded[n + pad + i] = 2 * x[n - 1] - x[n - 2 - i]
  }
  padded.set(x, pad)
  const sections = [biquad('highpass', lowHz, fs), biquad('lowpass', highHz, fs)]
  let y: Float64Array = padded
  for (const s of sections) y = runBiquad(s, y)
  y.reverse()
  for (const s of sections) y = runBiquad(s, y)
  y.reverse()
  return y.slice(pad, pad + n)
}

// In-place iterative radix-2 FFT; the length must be a power of two.
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const r = re[i]
      re[i] = re[j]
      re[j] = r
      const m = im[i]
      im[i] = im[j]
      im[j] = m
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const ang = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(ang * k)
        const wi = Math.sin(ang * k)
        const xr = re[i + k + half] * wr - im[i + k + half] * wi
        const xi = re[i + k + half] * wi + im[i + k + half] * wr
        re[i + k + half] = re[i + k] - xr
        im[i + k + half] = im[i + k] - xi
        re[i + k] += xr
        im[i + k] += xi
      }
    }
  }
}

export type Spectrum = { power: Float64Array; binHz: number; windowPeaksHz: number[] }

const NFFT = 4096

// Welch average of Hann-windowed power spectra over sliding windows,
// zero-padded to NFFT points. Each window's own peak is kept for the log.
export function welch(x: Float64Array, fs: number, windowS = WINDOW_S, hopS = HOP_S): Spectrum {
  const win = Math.min(x.length, Math.round(windowS * fs))
  const hop = Math.max(1, Math.round(hopS * fs))
  const binHz = fs / NFFT
  const power = new Float64Array(NFFT / 2 + 1)
  const windowPeaksHz: number[] = []
  if (win < 4) return { power, binHz, windowPeaksHz }
  const hann = new Float64Array(win)
  for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1))
  let count = 0
  for (let start = 0; start + win <= x.length; start += hop) {
    let mean = 0
    for (let i = 0; i < win; i++) mean += x[start + i]
    mean /= win
    const re = new Float64Array(NFFT)
    const im = new Float64Array(NFFT)
    for (let i = 0; i < win; i++) re[i] = (x[start + i] - mean) * hann[i]
    fft(re, im)
    const p = new Float64Array(NFFT / 2 + 1)
    for (let k = 0; k <= NFFT / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k]
    for (let k = 0; k < p.length; k++) power[k] += p[k]
    windowPeaksHz.push(peakInBand(p, binHz).hz)
    count++
  }
  for (let k = 0; k < power.length; k++) power[k] /= count
  return { power, binHz, windowPeaksHz }
}

// The highest bin in the band, refined by parabolic interpolation.
export function peakInBand(
  power: Float64Array,
  binHz: number,
  lowHz = BAND_LOW_HZ,
  highHz = BAND_HIGH_HZ,
): { hz: number; bin: number } {
  const k0 = Math.max(1, Math.ceil(lowHz / binHz))
  const k1 = Math.min(power.length - 2, Math.floor(highHz / binHz))
  let best = k0
  for (let k = k0; k <= k1; k++) if (power[k] > power[best]) best = k
  const a = power[best - 1]
  const b = power[best]
  const c = power[best + 1]
  const denom = a - 2 * b + c
  const delta = denom === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom))
  return { hz: (best + delta) * binHz, bin: best }
}

// Share of the in-band power that sits within ±halfWidthHz of the peak: near
// 1 for a clean rhythm, small for noise.
export function prominence(
  power: Float64Array,
  binHz: number,
  peakHz: number,
  halfWidthHz = 2 / WINDOW_S,
  lowHz = BAND_LOW_HZ,
  highHz = BAND_HIGH_HZ,
): number {
  let inBand = 0
  let nearPeak = 0
  for (let k = Math.ceil(lowHz / binHz); k <= Math.floor(highHz / binHz) && k < power.length; k++) {
    inBand += power[k]
    if (Math.abs(k * binHz - peakHz) <= halfWidthHz) nearPeak += power[k]
  }
  return inBand > 0 ? nearPeak / inBand : 0
}

// Breaths per minute from upward crossings, with hysteresis so noise near
// zero doesn't add crossings: a crossing counts when the signal rises above
// +h after having been below -h. The rate uses the time between the first
// and the last crossing, so partial breaths at the ends don't bias it.
export function zeroCrossingRate(x: Float64Array, fs: number, hysteresis = HYSTERESIS): { perMin: number; crossings: number } {
  let mean = 0
  for (const v of x) mean += v
  mean /= x.length || 1
  let variance = 0
  for (const v of x) variance += (v - mean) ** 2
  const h = hysteresis * Math.sqrt(variance / (x.length || 1))
  const times: number[] = []
  let armed = false
  for (let i = 1; i < x.length; i++) {
    const v = x[i] - mean
    if (v < -h) armed = true
    else if (armed && v > h) {
      const prev = x[i - 1] - mean
      const frac = v === prev ? 0 : (h - prev) / (v - prev)
      times.push((i - 1 + Math.min(1, Math.max(0, frac))) / fs)
      armed = false
    }
  }
  if (times.length < 2) return { perMin: 0, crossings: times.length }
  const span = times[times.length - 1] - times[0]
  return { perMin: ((times.length - 1) / span) * 60, crossings: times.length }
}

// The full chain for one signal sampled on the uniform grid.
export function measureSignal(name: SignalName, x: Float64Array, fs = SAMPLE_RATE_HZ): SignalResult {
  const filtered = bandpass(detrend(x), fs)
  const spectrum = welch(filtered, fs)
  const peak = peakInBand(spectrum.power, spectrum.binHz)
  return {
    name,
    fftPerMin: peak.hz * 60,
    zcPerMin: zeroCrossingRate(filtered, fs).perMin,
    prominence: prominence(spectrum.power, spectrum.binHz, peak.hz),
    windowPeaksPerMin: spectrum.windowPeaksHz.map((hz) => hz * 60),
  }
}

// ---------------------------------------------------------------------------
// Quality gate and the whole analysis

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function gateStats(frames: readonly Frame[]): GateStats {
  const n = frames.length
  const durationS = n > 1 ? (frames[n - 1].t - frames[0].t) / 1000 : 0
  let maxGapMs = 0
  for (let i = 1; i < n; i++) maxGapMs = Math.max(maxGapMs, frames[i].t - frames[i - 1].t)
  const boxes = frames.flatMap((f) => (f.box ? [f.box] : []))
  const lostFraction = n ? 1 - boxes.length / n : 1
  let movedFraction = 0
  let maxShift = 0
  if (boxes.length) {
    const cx = (b: Box) => (b.x0 + b.x1) / 2
    const cy = (b: Box) => (b.y0 + b.y1) / 2
    const w = (b: Box) => b.x1 - b.x0
    const h = (b: Box) => b.y1 - b.y0
    const ref = { cx: median(boxes.map(cx)), cy: median(boxes.map(cy)), w: median(boxes.map(w)), h: median(boxes.map(h)) }
    let moved = 0
    for (const b of boxes) {
      const shift = Math.max(Math.abs(cx(b) - ref.cx) / ref.w, Math.abs(cy(b) - ref.cy) / ref.h)
      const scale = Math.max(Math.abs(w(b) / ref.w - 1), Math.abs(h(b) / ref.h - 1))
      maxShift = Math.max(maxShift, shift)
      if (shift > MOVE_LIMIT || scale > SCALE_LIMIT) moved++
    }
    movedFraction = moved / boxes.length
  }
  return { durationS, fps: durationS > 0 ? (n - 1) / durationS : 0, maxGapMs, lostFraction, movedFraction, maxShift }
}

export function gateRefusal(gate: GateStats): Refusal | null {
  if (gate.durationS < MIN_DURATION_S || gate.fps < MIN_FPS || gate.maxGapMs > MAX_GAP_MS) return 'too-few-frames'
  if (gate.lostFraction > MAX_LOST_FRACTION) return 'no-torso'
  if (gate.movedFraction > MAX_MOVED_FRACTION) return 'motion'
  return null
}

export function analyze(frames: readonly Frame[]): Analysis {
  const gate = gateStats(frames)
  const refused = gateRefusal(gate)
  if (refused) return { ok: false, refusal: refused, gate, signals: [], chosen: null }

  const times = frames.map((f) => f.t)
  const start = times[0]
  const end = times[times.length - 1]
  const names = [...new Set(frames.flatMap((f) => Object.keys(f.signals)))]
  if (names.length === 0) return { ok: false, refusal: 'no-rhythm', gate, signals: [], chosen: null }
  const signals = names.map((name) =>
    measureSignal(name, resample(times, frames.map((f) => f.signals[name] ?? NaN), SAMPLE_RATE_HZ, start, end)),
  )
  const chosen = signals.reduce((best, s) => (s.prominence > best.prominence ? s : best))
  if (chosen.prominence < MIN_PROMINENCE) return { ok: false, refusal: 'no-rhythm', gate, signals, chosen }
  const peaks = chosen.windowPeaksPerMin
  const spread = Math.max(...peaks) - Math.min(...peaks)
  if (Math.abs(chosen.fftPerMin - chosen.zcPerMin) > AGREEMENT_PER_MIN || spread > MAX_WINDOW_SPREAD_PER_MIN) {
    return { ok: false, refusal: 'disagree', gate, signals, chosen }
  }
  return { ok: true, perMin: Math.round(chosen.fftPerMin), gate, signals, chosen }
}
