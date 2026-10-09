import { describe, expect, it } from 'vitest'
import { meanLuma, shoulderMidY, torsoBox, type Point } from './roi'

function pose(overrides: Record<number, Partial<Point>>): Point[] {
  const points: Point[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))
  for (const [i, p] of Object.entries(overrides)) points[Number(i)] = { ...points[Number(i)], ...p }
  return points
}

const torso = { 11: { x: 0.65, y: 0.3 }, 12: { x: 0.35, y: 0.32 }, 23: { x: 0.6, y: 0.8 }, 24: { x: 0.4, y: 0.8 } }

describe('torso box', () => {
  it('spans the shoulders and hips', () => {
    expect(torsoBox(pose(torso))).toEqual({ x0: 0.35, y0: 0.3, x1: 0.65, y1: 0.8 })
  })

  it('clamps hips that are out of frame (a close shot of the chest)', () => {
    const box = torsoBox(pose({ ...torso, 23: { x: 0.6, y: 1.3, visibility: 0.1 }, 24: { x: 0.4, y: 1.3, visibility: 0.1 } }))
    expect(box).toEqual({ x0: 0.35, y0: 0.3, x1: 0.65, y1: 1 })
  })

  it('is null without a pose, with a hidden shoulder, or when tiny', () => {
    expect(torsoBox(undefined)).toBeNull()
    expect(torsoBox(pose({ ...torso, 12: { x: 0.35, y: 0.32, visibility: 0.2 } }))).toBeNull()
    expect(torsoBox(pose({ 11: { x: 0.5, y: 0.5 }, 12: { x: 0.52, y: 0.5 }, 23: { x: 0.5, y: 0.52 }, 24: { x: 0.52, y: 0.52 } }))).toBeNull()
  })

  it('gives the shoulder midpoint height', () => {
    expect(shoulderMidY(pose(torso))).toBeCloseTo(0.31, 10)
  })
})

describe('mean luminance', () => {
  // 4 x 2 RGBA image: left half black, right half white.
  const width = 4
  const height = 2
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) rgba.fill(x >= 2 ? 255 : 0, (y * width + x) * 4, (y * width + x) * 4 + 4)

  it('averages the pixels inside the box', () => {
    expect(meanLuma(rgba, width, height, { x0: 0.5, y0: 0, x1: 1, y1: 1 })).toBeCloseTo(255, 6)
    expect(meanLuma(rgba, width, height, { x0: 0, y0: 0, x1: 0.5, y1: 1 })).toBe(0)
    expect(meanLuma(rgba, width, height, { x0: 0, y0: 0, x1: 1, y1: 1 })).toBeCloseTo(127.5, 6)
  })

  it('is NaN for an empty box', () => {
    expect(meanLuma(rgba, width, height, { x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.5 })).toBeNaN()
  })
})
