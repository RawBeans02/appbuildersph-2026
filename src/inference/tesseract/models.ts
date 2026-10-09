import langUrl from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url'
import coreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'
import workerUrl from 'tesseract.js/dist/worker.min.js?url'
import type { OfflineModel } from '../../lib/offlineModels'
import { OCR_ENGINE } from '../ocr/engine'

// The iPhone fallback reader's files (off unless engine.ts switches it on):
// the Tesseract.js worker, its core with the WebAssembly built in, and the
// English LSTM data. Sizes are exact; models.node.test.ts checks them.
export const TESSERACT: OfflineModel = {
  id: 'tesseract-js-eng',
  version: '7.0.0-best-int',
  label: 'Medicine-box reader for iPhone (Tesseract.js, English)',
  device: 'phone',
  files: [
    { url: workerUrl, bytes: 111_307 },
    { url: coreUrl, bytes: 3_899_472 },
    { url: langUrl, bytes: 2_952_873 },
  ],
}

export const models: OfflineModel[] = OCR_ENGINE === 'tesseract' ? [TESSERACT] : []
