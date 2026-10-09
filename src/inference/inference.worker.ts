import { echoRuntime } from './echoRuntime'
import { createWorkerHandler } from './handler'
import type { WorkerRequest, WorkerResponse } from './protocol'

// The inference worker: the model runs here, off the main thread, so the UI
// stays responsive. A module worker, started by createInferenceWorker() in
// client.ts.

// The tsconfig has the DOM lib, not WebWorker, so the worker scope is typed by hand.
const ctx = self as unknown as {
  postMessage(message: WorkerResponse): void
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
}

// The real on-device runtime replaces echoRuntime (a test fake, not AI) here.
const handle = createWorkerHandler(echoRuntime, (message) => ctx.postMessage(message))

ctx.onmessage = (event) => handle(event.data)
