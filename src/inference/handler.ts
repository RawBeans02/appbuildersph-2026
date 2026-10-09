import type { Backend } from '../lib/backend'
import type { InferenceErrorCode, Runtime, WorkerResponse } from './protocol'

// The worker side of the protocol, kept free of `self` so it runs in tests.
// Every init and run joins one queue: a single model instance can't do two
// things at once, so they execute one at a time, in the order they arrived.
// A run may be sent right after init without waiting: it queues behind the init.

type ErrorResponse = Extract<WorkerResponse, { type: 'error' }>

function failure(id: number, code: InferenceErrorCode, reason: unknown): ErrorResponse {
  return { type: 'error', id, code, message: reason instanceof Error ? reason.message : String(reason) }
}

const isId = (value: unknown): value is number => Number.isSafeInteger(value)

// Shallow on purpose: the runtime reads the rest of the backend pick.
function isBackend(value: unknown): value is Backend {
  const kind = (value as { kind?: unknown } | null | undefined)?.kind
  return kind === 'webgpu' || kind === 'wasm' || kind === 'none'
}

type RequestFields = { type?: unknown; id?: unknown; backend?: unknown; input?: unknown; runId?: unknown }

export function createWorkerHandler(
  runtime: Runtime,
  post: (response: WorkerResponse) => void,
): (message: unknown) => void {
  let ready = false
  // Runs not answered yet, queued or running, so a cancel can find them.
  const runs = new Map<number, AbortController>()
  let queue = Promise.resolve()

  function enqueue(job: () => Promise<void>) {
    // Passing job twice keeps one job that throws from stalling every job after it.
    queue = queue.then(job, job)
  }

  async function init(id: number, backend: Backend) {
    ready = false
    try {
      await runtime.init(backend, (progress, partial) =>
        post(partial === undefined ? { type: 'progress', id, progress } : { type: 'progress', id, progress, partial }),
      )
    } catch (error) {
      post(failure(id, 'init-failed', error))
      return
    }
    ready = true
    post({ type: 'ready', id })
  }

  async function run(id: number, input: unknown, controller: AbortController) {
    // Still in the map means not answered yet; a cancel removes it.
    const pending = () => runs.get(id) === controller
    if (!pending()) return

    let response: WorkerResponse
    if (!ready) {
      response = failure(id, 'not-ready', 'The model is not ready. Send init and wait for it to succeed.')
    } else {
      try {
        const output = await runtime.run(input, {
          signal: controller.signal,
          onProgress: (progress, partial) => {
            if (pending()) post({ type: 'progress', id, progress, partial })
          },
        })
        response = { type: 'result', id, output }
      } catch (error) {
        response = failure(id, 'run-failed', error)
      }
    }

    // Cancelled while running: the cancel already answered, so drop the outcome.
    if (!pending()) return
    runs.delete(id)
    try {
      post(response)
    } catch (error) {
      // postMessage throws when the output can't be structured-cloned.
      post(failure(id, 'run-failed', error))
    }
  }

  function cancel(runId: number) {
    const controller = runs.get(runId)
    // Unknown, or already answered: nothing to do.
    if (!controller) return
    runs.delete(runId)
    controller.abort()
    post(failure(runId, 'cancelled', 'The run was cancelled.'))
  }

  return (message) => {
    const { type, id, backend, input, runId } = (message ?? {}) as RequestFields
    // Without an id there is no request to answer.
    if (!isId(id)) return

    switch (type) {
      case 'init':
        if (!isBackend(backend)) return post(failure(id, 'bad-request', 'init needs a backend.'))
        return enqueue(() => init(id, backend))
      case 'run': {
        if (runs.has(id)) return post(failure(id, 'bad-request', `Run ${id} is already in progress.`))
        const controller = new AbortController()
        runs.set(id, controller)
        return enqueue(() => run(id, input, controller))
      }
      case 'cancel':
        if (!isId(runId)) return post(failure(id, 'bad-request', 'cancel needs the runId to cancel.'))
        return cancel(runId)
      default:
        return post(failure(id, 'bad-request', `Unknown request type: ${typeof type === 'string' ? type : typeof type}.`))
    }
  }
}
