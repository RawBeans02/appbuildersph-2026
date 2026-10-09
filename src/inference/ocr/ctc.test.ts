import { describe, expect, it } from 'vitest'
import { buildCharset, ctcGreedyDecode } from './ctc'

const charset = buildCharset('L\nO\nT\n0\n6\n/\n')

// One-hot-ish steps: the given class gets prob p, the rest share the remainder.
function steps(classes: number[], p = 0.9) {
  const out = new Float32Array(classes.length * charset.length)
  classes.forEach((c, t) => {
    out.fill((1 - p) / (charset.length - 1), t * charset.length, (t + 1) * charset.length)
    out[t * charset.length + c] = p
  })
  return out
}

describe('buildCharset', () => {
  it('puts the blank first and a space last', () => {
    expect(charset).toEqual(['', 'L', 'O', 'T', '0', '6', '/', ' '])
    expect(buildCharset('a\r\nb')).toEqual(['', 'a', 'b', ' '])
  })
})

describe('ctcGreedyDecode', () => {
  it('collapses repeats and drops blanks', () => {
    // L L _ O T T _ (space) 0 6 / 0 6
    const probs = steps([1, 1, 0, 2, 3, 3, 0, 7, 4, 5, 6, 4, 5])
    expect(ctcGreedyDecode(probs, 13, charset.length, charset)).toEqual({
      text: 'LOT 06/06',
      score: expect.closeTo(0.9, 5),
    })
  })

  it('keeps a doubled letter when a blank separates it', () => {
    const probs = steps([4, 0, 4, 4])
    expect(ctcGreedyDecode(probs, 4, charset.length, charset).text).toBe('00')
  })

  it('scores the kept characters only, and an empty line as 0', () => {
    const probs = steps([0, 0, 0])
    expect(ctcGreedyDecode(probs, 3, charset.length, charset)).toEqual({ text: '', score: 0 })
  })

  it('refuses a dictionary that does not match the model', () => {
    expect(() => ctcGreedyDecode(new Float32Array(10), 1, 10, charset)).toThrow(/10 classes/)
  })
})
