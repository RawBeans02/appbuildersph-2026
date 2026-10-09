import { describe, expect, it } from 'vitest'
import { dbBoxes, sortReadingOrder, type Box } from './dbPostprocess'

// A synthetic probability map: background 0, rectangles filled with a value.
function map(width: number, height: number, rects: [number, number, number, number, number][]) {
  const data = new Float32Array(width * height)
  for (const [x0, y0, x1, y1, value] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = value
  }
  return { data, width, height }
}

describe('dbBoxes', () => {
  it('finds each text region, expands it and scales it to the source image', () => {
    // Two lines: one at the top right, one below on the left.
    const probs = map(64, 32, [
      [30, 4, 60, 10, 0.9],
      [4, 18, 40, 26, 0.8],
    ])
    const boxes = dbBoxes(probs, { width: 128, height: 64 })
    expect(boxes).toHaveLength(2)
    const [first, second] = boxes
    // 30x6 region: grow = 30*6*1.5 / (2*36) = 3.75 px, then 2x scale.
    expect(first).toMatchObject({ x0: 53, y0: 1, x1: 128, y1: 28 })
    expect(first.score).toBeCloseTo(0.9, 5)
    expect(second.y0).toBeGreaterThan(first.y0)
    expect(second.score).toBeCloseTo(0.8, 5)
  })

  it('drops regions that score under the box threshold or are too thin', () => {
    const probs = map(64, 32, [
      [4, 4, 30, 12, 0.45],
      [40, 4, 60, 6, 0.95],
      [4, 20, 30, 28, 0.95],
    ])
    const boxes = dbBoxes(probs, { width: 64, height: 32 })
    expect(boxes).toHaveLength(1)
    expect(boxes[0].y0).toBeGreaterThanOrEqual(14)
  })

  it('returns nothing for an empty map', () => {
    expect(dbBoxes(map(16, 16, []), { width: 16, height: 16 })).toEqual([])
  })
})

describe('sortReadingOrder', () => {
  const box = (x0: number, y0: number): Box => ({ x0, y0, x1: x0 + 10, y1: y0 + 10, score: 1 })

  it('reads top to bottom, and left to right within a line', () => {
    const sorted = sortReadingOrder([box(50, 22), box(0, 105), box(10, 25), box(80, 20)])
    expect(sorted.map((b) => [b.x0, b.y0])).toEqual([
      [10, 25],
      [50, 22],
      [80, 20],
      [0, 105],
    ])
  })
})
