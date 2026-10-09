import { detectPlatform } from '../../lib/backend'

// Which engine reads medicine boxes. PP-OCRv5 on ONNX Runtime Web everywhere,
// unless the S2 phone test fails on iPhone: then set this to true, and iPhones
// use Tesseract.js instead (a smaller download and an older model). Android
// and laptops keep PP-OCR either way.
export const TESSERACT_ON_IPHONE = false

export type OcrEngine = 'pp-ocr' | 'tesseract'

export function chooseOcrEngine(ios: boolean, tesseractOnIphone = TESSERACT_ON_IPHONE): OcrEngine {
  return ios && tesseractOnIphone ? 'tesseract' : 'pp-ocr'
}

// This device's engine; PP-OCR outside a browser (tests).
export const OCR_ENGINE: OcrEngine = chooseOcrEngine(typeof navigator !== 'undefined' && detectPlatform().ios)
