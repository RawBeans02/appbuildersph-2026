import { describe, expect, it } from 'vitest'
import { chooseOcrEngine, TESSERACT_ON_IPHONE } from './engine'

describe('chooseOcrEngine', () => {
  it('uses PP-OCR everywhere while the iPhone switch is off', () => {
    expect(TESSERACT_ON_IPHONE).toBe(false)
    expect(chooseOcrEngine(true)).toBe('pp-ocr')
    expect(chooseOcrEngine(false)).toBe('pp-ocr')
  })

  it('switches only iPhones to Tesseract when turned on', () => {
    expect(chooseOcrEngine(true, true)).toBe('tesseract')
    expect(chooseOcrEngine(false, true)).toBe('pp-ocr')
  })
})
