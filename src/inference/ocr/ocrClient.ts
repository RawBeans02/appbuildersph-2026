import type { Backend } from '../../lib/backend'
import { createInferenceClient, createInferenceWorker, type InferenceClient } from '../client'
import type { OcrInput, OcrOutput } from './runtime'

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

export async function readBox(pixels: OcrInput, signal?: AbortSignal): Promise<OcrOutput> {
  const client = await getOcrClient()
  return client.run<OcrOutput>(pixels, { signal })
}
