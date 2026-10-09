import { describe, expect, it } from 'vitest'
import { stageTracker, type ReadProgress } from './ocrClient'

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
