import type { Backend } from '../lib/backend'
import type { InferenceErrorCode, WorkerRequest, WorkerResponse } from './protocol'

// The main-thread side of the inference worker: turns the message protocol
// into promises. Each request gets a fresh id, and the worker's final response
// with that id settles the call.

export class InferenceError extends Error {
  readonly code: InferenceErrorCode

  constructor(code: InferenceErrorCode, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'InferenceError'
    this.code = code
  }
}

// The parts of a Worker the client uses. A real Worker satisfies it; tests pass fakes.
export type WorkerLike = {
  postMessage(message: WorkerRequest): void
  // 'error' fires when the worker script fails to load, or throws outside the handler.
  addEventListener(type: 'message' | 'error', listener: (event: Event) => void): void
  removeEventListener(type: 'message' | 'error', listener: (event: Event) => void): void
  terminate(): void
}

export type InitOptions = {
  // 0..1, e.g. while the runtime compiles or warms up the model.
  onProgress?: (progress: number) => void
}

export type RunOptions = {
  // progress runs 0..1. partial is runtime-defined, e.g. the newly streamed text.
  onProgress?: (progress: number, partial?: unknown) => void
  // Aborting cancels the run in the worker, queued or running.
  signal?: AbortSignal
}

export type InferenceClient = {
  // Rejects with 'init-failed'. Call it again to retry or to switch backend.
  init(backend: Backend, options?: InitOptions): Promise<void>
  // Runs one at a time in call order. Rejects with 'not-ready', 'run-failed',
  // 'cancelled' or 'bad-request' (an input that can't be structured-cloned).
  run<Output = unknown>(input: unknown, options?: RunOptions): Promise<Output>
  // Stops the worker for good and rejects every pending call with 'cancelled'.
  dispose(): void
}

type PendingCall = {
  kind: 'init' | 'run'
  resolve(value: unknown): void
  reject(error: InferenceError): void
  onProgress?: (progress: number, partial?: unknown) => void
  // Removes the abort listener, so a long-lived signal doesn't hold on to the call.
  cleanup?: () => void
}

// Kept apart from the client so tests never start a real Worker. Vite spots this
// exact `new Worker(new URL(...), { type: 'module' })` form and bundles the worker.
export function createInferenceWorker(): Worker {
  return new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' })
}

export function createInferenceClient(worker: WorkerLike): InferenceClient {
  const pending = new Map<number, PendingCall>()
  let nextId = 1
  let disposed = false

  const disposedError = () => new InferenceError('cancelled', 'The inference worker was shut down.')
  const cancelledError = (signal?: AbortSignal) =>
    new InferenceError('cancelled', 'The run was cancelled.', signal?.reason)

  function take(id: number): PendingCall | undefined {
    const call = pending.get(id)
    pending.delete(id)
    call?.cleanup?.()
    return call
  }

  function onMessage(event: Event) {
    const response = (event as MessageEvent<WorkerResponse>).data
    if (response.type === 'progress') {
      const onProgress = pending.get(response.id)?.onProgress
      if (response.partial === undefined) onProgress?.(response.progress)
      else onProgress?.(response.progress, response.partial)
      return
    }
    const call = take(response.id)
    if (!call) return
    if (response.type === 'error') call.reject(new InferenceError(response.code, response.message))
    else call.resolve(response.type === 'result' ? response.output : undefined)
  }

  // The worker failed to load (say, its chunk isn't cached and the device is
  // offline) or crashed: nothing pending will get an answer, so fail it all now.
  function onError(event: Event) {
    const message = (event as ErrorEvent).message || 'The inference worker failed to load or crashed.'
    for (const id of [...pending.keys()]) {
      const call = take(id)
      call?.reject(new InferenceError(call.kind === 'init' ? 'init-failed' : 'run-failed', message))
    }
  }

  worker.addEventListener('message', onMessage)
  worker.addEventListener('error', onError)

  function send(request: WorkerRequest) {
    try {
      worker.postMessage(request)
    } catch (error) {
      // postMessage throws when the input can't be structured-cloned.
      const message = error instanceof Error ? error.message : String(error)
      take(request.id)?.reject(new InferenceError('bad-request', message, error))
    }
  }

  return {
    init(backend, { onProgress } = {}) {
      if (disposed) return Promise.reject(disposedError())
      const id = nextId++
      return new Promise<void>((resolve, reject) => {
        pending.set(id, { kind: 'init', resolve: () => resolve(), reject, onProgress })
        send({ type: 'init', id, backend })
      })
    },

    run<Output>(input: unknown, { onProgress, signal }: RunOptions = {}): Promise<Output> {
      if (disposed) return Promise.reject(disposedError())
      if (signal?.aborted) return Promise.reject(cancelledError(signal))
      const id = nextId++
      return new Promise<Output>((resolve, reject) => {
        const onAbort = () => {
          if (!take(id)) return
          send({ type: 'cancel', id: nextId++, runId: id })
          reject(cancelledError(signal))
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        pending.set(id, {
          kind: 'run',
          resolve: (output) => resolve(output as Output),
          reject,
          onProgress,
          cleanup: () => signal?.removeEventListener('abort', onAbort),
        })
        send({ type: 'run', id, input })
      })
    },

    dispose() {
      if (disposed) return
      disposed = true
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      worker.terminate()
      for (const id of [...pending.keys()]) take(id)?.reject(disposedError())
    },
  }
}
