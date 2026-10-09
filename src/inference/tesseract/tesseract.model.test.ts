import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseLabel } from '../../rules/label'
import { linesFromBlocks } from './lines'

// Runs real Tesseract.js (Node build) with the same English data on the
// synthetic label. Skipped for now: in CI run 37901821367 the Node build took
// the whole Vitest process down with no report. The fallback is off, and on a
// phone it runs Tesseract.js's browser build; check it there before switching
// it on.
describe.skip('Tesseract.js on a synthetic medicine label (skipped, see above)', () => {
  it('reads the lot and expiry', { timeout: 120_000 }, async () => {
    const { createWorker, OEM } = await import('tesseract.js')
    const lang = readFileSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')
    const worker = await createWorker([{ code: 'eng', data: new Uint8Array(lang) }], OEM.LSTM_ONLY, { cacheMethod: 'none' })
    try {
      const started = performance.now()
      const { data } = await worker.recognize(readFileSync('src/inference/ocr/fixtures/label.ppm'), {}, { blocks: true })
      const lines = linesFromBlocks(data.blocks)
      console.log('Tesseract lines:', lines.map((l) => l.text), 'ms (CI runner):', Math.round(performance.now() - started))
      const reading = parseLabel(lines)
      expect(reading.lot?.value).toBe('A23B456')
      expect(reading.expiry?.value).toBe('2027-06')
    } finally {
      await worker.terminate()
    }
  })
})
