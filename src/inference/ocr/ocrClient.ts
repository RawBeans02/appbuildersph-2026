import type { Backend } from '../../lib/backend'
import { downscaleImage, imageToPixels } from '../../lib/image'
import { createInferenceClient, createInferenceWorker, type InferenceClient } from '../client'
import { OCR_ENGINE } from './engine'
import type { OcrLine } from './pipeline'
import type { OcrOutput } from './runtime'

// The app's one OCR worker, started on first use and kept, since loading the
// models takes a few seconds. WASM, single-threaded, on every device: the
// spike's choice (no WebGPU on iPhone, no threads without isolation).

const OCR_BACKEND: Backend = {
  kind: 'wasm',
  threads: 1,
  reason: 'Medicine-box reader: WASM on every device',
  threadsReason: 'Single-threaded',
}

let ready: Promise<InferenceClient> | null = null

export function getOcrClient(): Promise<InferenceClient> {
  if (!ready) {
    const starting = (async () => {
      const client = createInferenceClient(createInferenceWorker())
      try {
        await client.init(OCR_BACKEND)
      } catch (error) {
        client.dispose()
        throw error
      }
      return client
    })()
    ready = starting
    // A failed start (say, models not downloaded and no signal) can be retried.
    starting.catch(() => {
      if (ready === starting) ready = null
    })
  }
  return ready
}

let readerLoaded = false

// Whether this device's reader is already loaded (its models in memory).
export const isReaderLoaded = () => readerLoaded

// Loads this device's reader without reading anything, so the screen can time
// the model load and the reading separately.
export async function warmUpReader(): Promise<void> {
  if (OCR_ENGINE === 'tesseract') {
    const { getTesseract } = await import('../tesseract/reader')
    await getTesseract()
  } else {
    await getOcrClient()
  }
  readerLoaded = true
}

// Reads a photo of a medicine box with this device's engine (engine.ts).
export async function readBox(photo: Blob, signal?: AbortSignal): Promise<OcrLine[]> {
  if (OCR_ENGINE === 'tesseract') {
    const [{ readWithTesseract }, small] = await Promise.all([
      import('../tesseract/reader'),
      downscaleImage(photo, { type: 'image/png' }),
    ])
    return readWithTesseract(small.blob)
  }
  const pixels = await imageToPixels(photo)
  const client = await getOcrClient()
  return (await client.run<OcrOutput>(pixels, { signal })).lines
}
