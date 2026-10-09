import { describe, expect, it } from 'vitest'
import { chooseOcrEngine, engineOverride, TESSERACT_ON_IPHONE } from './engine'

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

describe('engineOverride', () => {
  function memoryStorage() {
    const map = new Map<string, string>()
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    }
  }

  it('takes ?engine= and remembers it until ?engine=auto', () => {
    const storage = memoryStorage()
    expect(engineOverride('', storage)).toBeNull()
    expect(engineOverride('?engine=tesseract', storage)).toBe('tesseract')
    expect(engineOverride('', storage)).toBe('tesseract')
    expect(engineOverride('?engine=ppocr', storage)).toBe('pp-ocr')
    expect(engineOverride('?engine=auto', storage)).toBeNull()
    expect(engineOverride('', storage)).toBeNull()
  })

  it('ignores unknown values, and works for one page when storage is blocked', () => {
    expect(engineOverride('?engine=gpt', memoryStorage())).toBeNull()
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(engineOverride('?engine=tesseract', blocked)).toBe('tesseract')
    expect(engineOverride('', blocked)).toBeNull()
    expect(engineOverride('?engine=tesseract', null)).toBe('tesseract')
  })
})
