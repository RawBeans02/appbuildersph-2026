import { createWorker, OEM, type Worker as TesseractWorker } from 'tesseract.js'
import { loadModelFile } from '../../lib/modelCache'
import type { OcrLine } from '../ocr/pipeline'
import { linesFromBlocks } from './lines'
import { TESSERACT } from './models'

// Tesseract.js, loaded only when engine.ts picks it. Every file comes out of
// the model cache on the main thread and reaches Tesseract's worker as a blob
// URL or as bytes, so nothing is fetched from inside a worker (offline on
// Safari doesn't depend on the service worker seeing worker requests).

async function blobUrl(index: number): Promise<string> {
  const bytes = await loadModelFile(TESSERACT, TESSERACT.files[index])
  return URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }))
}

let ready: Promise<TesseractWorker> | null = null

export function getTesseract(): Promise<TesseractWorker> {
  if (!ready) {
    const starting = (async () => {
      const [workerPath, core, lang] = await Promise.all([
        blobUrl(0),
        blobUrl(1),
        loadModelFile(TESSERACT, TESSERACT.files[2]),
      ])
      return createWorker([{ code: 'eng', data: new Uint8Array(lang) }], OEM.LSTM_ONLY, {
        workerPath,
        workerBlobURL: false,
        // Tesseract.js imports corePath as one file only when it ends in "js";
        // a blob URL ignores its #fragment, so the fragment just satisfies that.
        corePath: `${core}#tesseract-core-simd-lstm.wasm.js`,
        cacheMethod: 'none',
      })
    })()
    ready = starting
    starting.catch(() => {
      if (ready === starting) ready = null
    })
  }
  return ready
}

export async function readWithTesseract(image: Blob): Promise<OcrLine[]> {
  const worker = await getTesseract()
  const { data } = await worker.recognize(image, {}, { blocks: true, text: false })
  return linesFromBlocks(data.blocks)
}
