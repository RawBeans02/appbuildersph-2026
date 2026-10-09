import { describe, expect, it } from 'vitest'
import { lineFrame, stageTracker, type ReadProgress } from './ocrClient'

describe('stageTracker', () => {
  it("starts reading at the pipeline's first report, then counts the lines read", () => {
    const seen: ReadProgress[] = []
    const track = stageTracker((progress) => seen.push(progress))
    // pipeline.ts: 0.3 when detection ends, then 0.3 + 0.7 * lines read / lines found.
    for (const progress of [0.3, 0.3 + 0.7 / 4, 0.3 + 0.7 / 2, 1]) track(progress)
    expect(seen.map((p) => p.stage)).toEqual(['recognize', 'recognize', 'recognize', 'recognize'])
    expect(seen.map((p) => p.fraction)).toEqual([0, expect.closeTo(0.25, 5), expect.closeTo(0.5, 5), 1])
  })

  it('stays within 0..1', () => {
    const seen: ReadProgress[] = []
    const track = stageTracker((progress) => seen.push(progress))
    track(1)
    track(1)
    expect(seen.map((p) => p.fraction)).toEqual([0, 1])
  })
})

describe('lineFrame', () => {
  it('places a box as fractions of the image the reader saw', () => {
    expect(lineFrame({ x0: 128, y0: 240, x1: 640, y1: 300, score: 0.9 }, { width: 1280, height: 960 })).toEqual({
      left: 0.1,
      top: 0.25,
      width: 0.4,
      height: 0.0625,
    })
  })
  it('clamps a box that spills past the edges (the unclip step can grow it)', () => {
    const frame = lineFrame({ x0: -10, y0: 900, x1: 1300, y1: 1000, score: 0.9 }, { width: 1280, height: 960 })
    expect(frame.left).toBe(0)
    expect(frame.width).toBe(1)
    expect(frame.top).toBe(0.9375)
    expect(frame.top + frame.height).toBe(1)
  })
})
