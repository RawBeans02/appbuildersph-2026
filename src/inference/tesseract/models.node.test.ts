import { statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TESSERACT } from './models'

const files = [
  'node_modules/tesseract.js/dist/worker.min.js',
  'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
]

describe('Tesseract file sizes', () => {
  it('match the installed packages', () => {
    files.forEach((file, i) => expect(statSync(file).size, file).toBe(TESSERACT.files[i].bytes))
  })
})
