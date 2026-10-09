import { describe, expect, it } from 'vitest'
import {
  analyze,
  bandpass,
  detrend,
  fft,
  gateStats,
  peakInBand,
  resample,
  zeroCrossingRate,
  type Frame,
} from './dsp'
import type { Box } from './roi'

// Synthetic recordings only: sinusoids and noise from a seeded generator, with
// frame times like a phone camera loop (about 15 fps, jitter, dropped frames).

function rng(seed: number) {
  let a = seed >>> 0
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gauss = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform())
  return { uniform, gauss }
}

type Rng = ReturnType<typeof rng>
const A = 0.005 // breathing amplitude of the shoulder height, normalized
const BOX: Box = { x0: 0.3, y0: 0.35, x1: 0.7, y1: 0.9 }

// A breathing waveform with values in -1..1. `inhale` is the share of the
// cycle spent rising (0.5 gives a sinusoid-like shape).
function breath(perMin: number, s: number, phase: number, inhale = 0.5) {
  const p = ((s * perMin) / 60 + phase) % 1
  const w = p < inhale ? 0.5 - 0.5 * Math.cos((Math.PI * p) / inhale) : 0.5 + 0.5 * Math.cos((Math.PI * (p - inhale)) / (1 - inhale))
  return 2 * w - 1
}

type Synth = {
  seed: number
  durationS?: number
  // Breathing in the shoulder signal and/or the luminance signal; null = none.
  shoulderRate?: number | null
  lumaRate?: number | null
  inhale?: number
  // Per-frame noise, in units of the breathing amplitude.
  noise?: number
  // Torso box for frame time s (seconds); null = torso lost.
  box?: (s: number, r: Rng) => Box | null
}

function synth({ seed, durationS = 60, shoulderRate = null, lumaRate = null, inhale = 0.5, noise = 0.3, box }: Synth): Frame[] {
  const r = rng(seed)
  const phase = r.uniform()
  const frames: Frame[] = []
  let t = 5000
  while (t <= 5000 + durationS * 1000) {
    const s = (t - 5000) / 1000
    // Drift: a linear trend plus a slow wander below the breathing band.
    const drift = (3 * s) / 60 + Math.sin(2 * Math.PI * 0.03 * s)
    const shoulder = 0.35 + A * ((shoulderRate ? breath(shoulderRate, s, phase, inhale) : 0) + drift + noise * r.gauss())
    const luma = 120 + 2 * ((lumaRate ? breath(lumaRate, s, phase, inhale) : 0) + drift + noise * r.gauss())
    const b = box ? box(s, r) : BOX
    frames.push({ t, box: b, luma, shoulderY: b ? shoulder : null })
    t += 1000 / 15 + 8 * r.gauss()
    if (r.uniform() < 0.03) t += 1000 / 15 // a dropped frame
  }
  return frames
}

describe('breathing rate on synthetic recordings', () => {
  it.each([20, 30, 45, 60])('%i/min in the shoulder signal, with noise and drift, comes back within ±2/min', (rate) => {
    for (let seed = 1; seed <= 5; seed++) {
      const result = analyze(synth({ seed: seed * 101 + rate, shoulderRate: rate }))
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(Math.abs(result.perMin - rate)).toBeLessThanOrEqual(2)
      expect(result.chosen.name).toBe('shoulder')
    }
  })

  it.each([20, 30, 45, 60])('%i/min in the luminance signal comes back within ±2/min and luminance is picked', (rate) => {
    const result = analyze(synth({ seed: rate, lumaRate: rate }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Math.abs(result.perMin - rate)).toBeLessThanOrEqual(2)
    expect(result.chosen.name).toBe('luma')
  })

  it('a breath with a short inhale (40% of the cycle) at 45/min comes back within ±2/min', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const result = analyze(synth({ seed, shoulderRate: 45, inhale: 0.4 }))
      expect(result.ok && Math.abs(result.perMin - 45)).toBeLessThanOrEqual(2)
    }
  })

  it('picks the signal with the more prominent peak', () => {
    const result = analyze(synth({ seed: 7, shoulderRate: 30, lumaRate: 30, noise: 0.3 }))
    expect(result.signals.map((s) => s.name)).toEqual(['luma', 'shoulder'])
    const best = Math.max(...result.signals.map((s) => s.prominence))
    expect(result.chosen?.prominence).toBe(best)
  })
})

describe('refusals', () => {
  it('refuses flat noise (no breathing in either signal)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const result = analyze(synth({ seed, noise: 1 }))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(['no-rhythm', 'disagree']).toContain(result.refusal)
    }
  })

  it('refuses random-walk noise (slow sway, no breathing)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = rng(seed)
      let y = 0.35
      let luma = 120
      const frames: Frame[] = []
      for (let t = 0; t <= 60_000; t += 1000 / 15) {
        y += 0.0008 * r.gauss()
        luma += 0.5 * r.gauss()
        frames.push({ t, box: BOX, luma, shoulderY: y })
      }
      expect(analyze(frames).ok).toBe(false)
    }
  })

  it('a step "motion" artifact (the camera moves at 30 s) trips the gate', () => {
    const moved = (s: number): Box => (s < 30 ? BOX : { ...BOX, y0: BOX.y0 + 0.17, y1: BOX.y1 + 0.17 })
    const frames = synth({ seed: 3, shoulderRate: 45, box: moved }).map((f) =>
      f.t - 5000 < 30_000 ? f : { ...f, luma: f.luma + 40, shoulderY: f.shoulderY! + 0.17 },
    )
    const result = analyze(frames)
    expect(result).toMatchObject({ ok: false, refusal: 'motion' })
    expect(result.gate.movedFraction).toBeGreaterThan(0.4)
  })

  it('breathing-sized movement of the torso box does not trip the gate', () => {
    const breathing = (s: number): Box => ({ ...BOX, y0: BOX.y0 + 0.01 * Math.sin(2 * Math.PI * 0.75 * s) })
    const result = analyze(synth({ seed: 4, shoulderRate: 45, box: breathing }))
    expect(result.ok).toBe(true)
    expect(result.gate.movedFraction).toBe(0)
  })

  it('refuses when the torso is lost in more than 20% of frames', () => {
    const lost = (s: number) => (s % 10 < 3 ? null : BOX) // lost 30% of the time
    expect(analyze(synth({ seed: 5, shoulderRate: 30, box: lost }))).toMatchObject({ ok: false, refusal: 'no-torso' })
  })

  it('still counts when the torso is lost in a few frames', () => {
    const flicker = (_s: number, r: Rng) => (r.uniform() < 0.1 ? null : BOX)
    const result = analyze(synth({ seed: 6, shoulderRate: 30, box: flicker }))
    expect(result.ok && result.perMin).toBe(30)
  })

  it('refuses a recording that is too short or has a long pause', () => {
    expect(analyze(synth({ seed: 8, shoulderRate: 30, durationS: 30 }))).toMatchObject({ refusal: 'too-few-frames' })
    const paused = synth({ seed: 8, shoulderRate: 30 }).filter((f) => f.t < 30_000 || f.t > 32_500)
    expect(analyze(paused)).toMatchObject({ refusal: 'too-few-frames' })
  })

  // Deterministic recordings for the two "disagree" checks.
  const shoulderOnly = (f: (s: number) => number): Frame[] => {
    const frames: Frame[] = []
    for (let t = 0; t <= 60_000; t += 1000 / 15) frames.push({ t, box: BOX, luma: 120, shoulderY: 0.35 + A * f(t / 1000) })
    return frames
  }

  it('refuses when the spectral peak and the zero-crossing count disagree', () => {
    // Deep breaths alternating with very shallow ones at 40/min: the spectral
    // peak is at 40, but the shallow breaths stay inside the zero-crossing
    // hysteresis, so the crossings count only 20.
    const result = analyze(
      shoulderOnly((s) => (Math.floor((s * 40) / 60) % 2 ? 0.1 : 1) * -Math.cos(2 * Math.PI * (40 / 60) * s)),
    )
    expect(result).toMatchObject({ ok: false, refusal: 'disagree' })
    expect(result.chosen?.fftPerMin).toBeCloseTo(40, 0)
    expect(result.chosen?.zcPerMin).toBeCloseTo(20, 0)
  })

  it('refuses when the rate drifts too much across the 30 s windows', () => {
    // The rate climbs from 36 to 52/min over the minute.
    let phase = 0
    let prev = 0
    const result = analyze(
      shoulderOnly((s) => {
        phase += 2 * Math.PI * ((36 + (16 * s) / 60) / 60) * (s - prev)
        prev = s
        return Math.sin(phase)
      }),
    )
    expect(result).toMatchObject({ ok: false, refusal: 'disagree' })
    const peaks = result.chosen!.windowPeaksPerMin
    expect(Math.max(...peaks) - Math.min(...peaks)).toBeGreaterThan(6)
  })
})

describe('building blocks', () => {
  it('resamples by linear interpolation and holds the ends', () => {
    const out = resample([1000, 2000, 3000], [0, 10, NaN], 2, 500, 2500)
    expect(Array.from(out)).toEqual([0, 0, 5, 10, 10])
  })

  it('detrend removes a straight line', () => {
    const out = detrend(Float64Array.from({ length: 50 }, (_, i) => 3 + 0.5 * i))
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(1e-9)
  })

  it('the FFT puts a tone in its bin', () => {
    const n = 256
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 10 * i) / n))
    const im = new Float64Array(n)
    fft(re, im)
    const power = re.map((v, k) => v * v + im[k] * im[k])
    expect(peakInBand(power.slice(0, n / 2 + 1), 1, 1, 100).bin).toBe(10)
    expect(power[10]).toBeCloseTo((n / 2) ** 2, 6)
  })

  it('the band-pass keeps breathing and removes slow drift and fast jitter', () => {
    const fs = 10
    const tone = (hz: number) => Float64Array.from({ length: 600 }, (_, i) => Math.sin((2 * Math.PI * hz * i) / fs))
    const rms = (x: Float64Array) => Math.sqrt(x.slice(100, 500).reduce((s, v) => s + v * v, 0) / 400)
    expect(rms(bandpass(tone(0.75), fs))).toBeGreaterThan(0.65)
    expect(rms(bandpass(tone(0.03), fs))).toBeLessThan(0.01)
    expect(rms(bandpass(tone(3), fs))).toBeLessThan(0.15)
  })

  it('counts upward zero crossings of a clean sine', () => {
    const x = Float64Array.from({ length: 600 }, (_, i) => Math.sin((2 * Math.PI * 0.5 * i) / 10 + 1))
    expect(zeroCrossingRate(x, 10).perMin).toBeCloseTo(30, 1)
  })

  it('reports the gate statistics', () => {
    const stats = gateStats(synth({ seed: 10, shoulderRate: 30 }))
    expect(stats.durationS).toBeGreaterThan(59)
    expect(stats.fps).toBeGreaterThan(13)
    expect(stats.lostFraction).toBe(0)
    expect(stats.maxShift).toBe(0)
  })
})
