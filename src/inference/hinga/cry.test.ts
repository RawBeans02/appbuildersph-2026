import { describe, expect, it } from 'vitest'
import { cryDetected, cryingSeconds, cryScore } from './cry'

describe('cry check', () => {
  it('scores a window by the higher of the two crying classes and ignores the rest', () => {
    expect(
      cryScore([
        { categoryName: 'Speech', score: 0.9 },
        { categoryName: 'Crying, sobbing', score: 0.2 },
        { categoryName: 'Baby cry, infant cry', score: 0.6 },
      ]),
    ).toBe(0.6)
    expect(cryScore([{ categoryName: 'Speech', score: 0.9 }])).toBe(0)
  })

  it('adds up the seconds above the threshold', () => {
    const windows = [0.1, 0.5, 0.31, 0.3, 0.9].map((score) => ({ durationS: 1, score }))
    expect(cryingSeconds(windows)).toBe(3) // 0.5, 0.31 and 0.9; exactly 0.3 doesn't count
  })

  it('refuses only after more than 3 s of crying in the minute', () => {
    const second = (score: number) => ({ durationS: 1, score })
    expect(cryDetected([second(0.8), second(0.8), second(0.8)])).toBe(false)
    expect(cryDetected([second(0.8), second(0.1), second(0.8), second(0.8), second(0.8)])).toBe(true)
    expect(cryDetected(Array.from({ length: 60 }, () => second(0.2)))).toBe(false)
  })
})
