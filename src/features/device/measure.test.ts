import { describe, expect, it } from 'vitest'
import { EMPTY_MEASUREMENTS, median, TABLE_HEADER, tableRow } from './measure'

describe('median', () => {
  it('is the middle value, or the mean of the two middle ones', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

describe('tableRow', () => {
  it('fills every column in the header order, escaping pipes', () => {
    const row = tableRow(
      {
        ...EMPTY_MEASUREMENTS,
        deviceName: 'iPhone 14 Pro Max',
        userAgent: 'Mozilla/5.0 (iPhone|test)',
        backend: 'wasm, 1 thread',
        ocrEngine: 'PP-OCRv5 (ONNX Runtime Web)',
        ocrLoadMs: null,
        ocrFirstReadMs: 1234.4,
        ocrWarmReadMs: 987.6,
        ocrReadCorrect: true,
        poseColdMs: 6894,
        poseWhere: 'worker',
        poseFps: 12.345,
      },
      new Date('2026-10-09T20:15:00Z'),
    )
    expect(row).toBe(
      '| 2026-10-09 20:15 UTC | iPhone 14 Pro Max | Mozilla/5.0 (iPhone\\|test) | wasm, 1 thread | PP-OCRv5 (ONNX Runtime Web) | already loaded | 1234 | 988 | yes | 6894 | – | worker | 12.3 | – | – |',
    )
    const columns = (line: string) => line.split(/(?<!\\)\|/).length
    expect(columns(row)).toBe(columns(TABLE_HEADER.split('\n')[0]))
  })
})
