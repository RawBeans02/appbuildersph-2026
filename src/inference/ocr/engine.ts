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

// A testing override for comparing the engines on a real phone without a
// deploy: open any page with ?engine=tesseract or ?engine=ppocr, and it sticks
// in this browser until ?engine=auto. Open /prepare with it first, so the
// right files download.
const OVERRIDE_KEY = 'agapay.ocrEngine'

type OverrideStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function engineOverride(search: string, storage: OverrideStorage | null): OcrEngine | null {
  const param = new URLSearchParams(search).get('engine')
  try {
    if (param === 'tesseract' || param === 'ppocr') storage?.setItem(OVERRIDE_KEY, param)
    if (param === 'auto') storage?.removeItem(OVERRIDE_KEY)
  } catch {
    // Storage blocked (private mode): the override then lasts for this page only.
  }
  let saved: string | null
  try {
    saved = storage?.getItem(OVERRIDE_KEY) ?? null
  } catch {
    saved = null
  }
  const choice = param === 'tesseract' || param === 'ppocr' ? param : param === 'auto' ? null : saved
  return choice === 'tesseract' ? 'tesseract' : choice === 'ppocr' ? 'pp-ocr' : null
}

function browserStorage(): OverrideStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const inBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined'
const override = inBrowser ? engineOverride(window.location.search, browserStorage()) : null

// This device's engine; PP-OCR outside a browser (tests).
export const OCR_ENGINE: OcrEngine = override ?? chooseOcrEngine(inBrowser && detectPlatform().ios)
export const OCR_ENGINE_OVERRIDDEN = override !== null

export const OCR_ENGINE_LABEL: Record<OcrEngine, string> = {
  'pp-ocr': 'PP-OCRv5 (ONNX Runtime Web)',
  tesseract: 'Tesseract.js',
}
