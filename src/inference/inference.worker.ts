import { createWorkerHandler } from './handler'
import { createOcrRuntime } from './ocr/runtime'
import type { WorkerRequest, WorkerResponse } from './protocol'

// The inference worker: the model runs here, off the main thread, so the UI
// stays responsive. A module worker, started by createInferenceWorker() in
// client.ts.

// The tsconfig has the DOM lib, not WebWorker, so the worker scope is typed by hand.
const ctx = self as unknown as {
  postMessage(message: WorkerResponse): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

// The medicine-box reader (PP-OCRv5 on ONNX Runtime Web). The echo runtime
// (echoRuntime.ts) stays as the test fake for the handler and client.
const handle = createWorkerHandler(createOcrRuntime(), (message) => ctx.postMessage(message))

ctx.onmessage = (event) => handle(event.data)
