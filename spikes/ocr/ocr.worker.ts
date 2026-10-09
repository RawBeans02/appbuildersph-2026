import { createWorkerHandler } from '../../src/inference/handler'
import type { WorkerRequest, WorkerResponse } from '../../src/inference/protocol'
import { createOcrRuntime } from './ocrRuntime'

// The OCR spike's worker: the shared inference protocol and handler, with the
// PP-OCRv5 runtime instead of the echo fake. Kept apart from the app's own
// worker, so this throwaway spike stays out of the real app.

const ctx = self as unknown as {
  postMessage(message: WorkerResponse): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

const handle = createWorkerHandler(createOcrRuntime(), (message) => ctx.postMessage(message))

ctx.onmessage = (event) => handle(event.data)
