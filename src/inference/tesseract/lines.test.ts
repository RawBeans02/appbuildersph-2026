import type { Block } from 'tesseract.js'
import { describe, expect, it } from 'vitest'
import { linesFromBlocks } from './lines'

const line = (text: string, confidence: number) => ({ text, confidence, bbox: { x0: 1, y0: 2, x1: 30, y1: 12 } })
const block = (lines: ReturnType<typeof line>[]) => ({ paragraphs: [{ lines }] }) as unknown as Block

describe('linesFromBlocks', () => {
  it('flattens blocks into lines with a 0..1 score and the box', () => {
    expect(linesFromBlocks([block([line('LOT: A23B456\n', 91.5), line('  ', 80)]), block([line('EXP: 06/2027', 120)])])).toEqual([
      { text: 'LOT: A23B456', score: 0.915, box: { x0: 1, y0: 2, x1: 30, y1: 12, score: 0.915 } },
      { text: 'EXP: 06/2027', score: 1, box: { x0: 1, y0: 2, x1: 30, y1: 12, score: 1 } },
    ])
    expect(linesFromBlocks(null)).toEqual([])
  })
})
