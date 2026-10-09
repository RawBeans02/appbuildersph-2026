import { createWorkerHandler } from '../../../inference/handler'
import type { WorkerRequest, WorkerResponse } from '../../../inference/protocol'
import { createWebLlmRuntime } from './webllmRuntime'

// The AI wording's worker: WebLLM on WebGPU, off the main thread, behind the
// app's inference protocol.

const ctx = self as unknown as {
  postMessage(message: WorkerResponse): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

const handle = createWorkerHandler(createWebLlmRuntime(), (message) => ctx.postMessage(message))

ctx.onmessage = (event) => handle(event.data)
