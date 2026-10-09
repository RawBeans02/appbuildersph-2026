import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { Backend } from '../lib/backend'
import { createInferenceClient, InferenceError, type WorkerLike } from './client'
import { echoRuntime } from './echoRuntime'
import { createWorkerHandler } from './handler'
import type { InferenceErrorCode, Runtime, WorkerRequest } from './protocol'

const wasm: Backend = { kind: 'wasm', threads: 1, reason: 'test', threadsReason: 'test' }

// Lets every queued microtask run; the echo runtime never uses real timers.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

// An in-memory Worker with a real handler on the far side. Messages are
// structured-cloned and delivered asynchronously, as with a real Worker.
class FakeWorker extends EventTarget {
  readonly sent: WorkerRequest[] = []
  terminated = false
  readonly #handle: (message: unknown) => void

  constructor(runtime: Runtime = echoRuntime) {
    super()
    this.#handle = createWorkerHandler(runtime, (response) => {
      const data = structuredClone(response)
      queueMicrotask(() => {
        if (!this.terminated) this.dispatchEvent(new MessageEvent('message', { data }))
      })
    })
  }

  postMessage(request: WorkerRequest) {
    if (this.terminated) return
    const data = structuredClone(request)
    this.sent.push(data)
    queueMicrotask(() => this.#handle(data))
  }

  terminate() {
    this.terminated = true
  }
}

function setup(runtime?: Runtime) {
  const worker = new FakeWorker(runtime)
  return { worker, client: createInferenceClient(worker) }
}

// Captures the rejection right away, so it is never unhandled while a test waits.
function failureOf(promise: Promise<unknown>): Promise<InferenceError> {
  return promise.then(
    () => {
      throw new Error('Expected the call to fail')
    },
    (error: unknown) => {
      if (error instanceof InferenceError) return error
      throw error
    },
  )
}

const codeOf = async (promise: Promise<unknown>): Promise<InferenceErrorCode> => (await failureOf(promise)).code

describe('createInferenceClient', () => {
  it('inits, then runs on the echo runtime with progress and partials', async () => {
    const { client } = setup()
    const initProgress = vi.fn()
    await client.init(wasm, { onProgress: initProgress })
    expect(initProgress.mock.calls).toEqual([[0.5], [1]])

    const runProgress = vi.fn()
    await expect(client.run<string>('salamat po', { onProgress: runProgress })).resolves.toBe('salamat po')
    expect(runProgress.mock.calls).toEqual([
      [0.5, 'salamat '],
      [1, 'po'],
    ])
  })

  it('rejects a run before init with not-ready', async () => {
    const { client } = setup()
    expect(await codeOf(client.run('hi'))).toBe('not-ready')
  })

  it('rejects with init-failed and the runtime message when init fails', async () => {
    const { client } = setup({
      init: async () => {
        throw new Error('No GPU adapter')
      },
      run: echoRuntime.run,
    })
    const error = await failureOf(client.init(wasm))
    expect(error).toMatchObject({ name: 'InferenceError', code: 'init-failed', message: 'No GPU adapter' })
  })

  it('rejects with run-failed when the runtime throws, and keeps working', async () => {
    const { client } = setup()
    await client.init(wasm)
    const error = await failureOf(client.run(42))
    expect(error).toMatchObject({ code: 'run-failed', message: 'The echo runtime only takes text.' })
    await expect(client.run('ayos')).resolves.toBe('ayos')
  })

  it('runs calls one at a time, in call order', async () => {
    const { client } = setup()
    const log: string[] = []
    const track = (name: string) => ({
      onProgress: (_progress: number, partial?: unknown) => log.push(`${name}:${String(partial)}`),
    })
    const init = client.init(wasm)
    const results = await Promise.all([
      client.run('a b', track('one')).then((output) => log.push(`one=${output}`)),
      client.run('c d', track('two')).then((output) => log.push(`two=${output}`)),
      init,
    ])
    expect(results).toHaveLength(3)
    expect(log).toEqual(['one:a ', 'one:b', 'one=a b', 'two:c ', 'two:d', 'two=c d'])
  })

  it('cancels a running run when its signal aborts: posts cancel, rejects with cancelled', async () => {
    const { client, worker } = setup()
    await client.init(wasm)
    const controller = new AbortController()
    const partials: unknown[] = []
    const run = client.run('isa dalawa tatlo', {
      signal: controller.signal,
      onProgress: (_progress, partial) => {
        partials.push(partial)
        controller.abort()
      },
    })
    expect(await codeOf(run)).toBe('cancelled')
    expect(worker.sent.at(-1)).toEqual({ type: 'cancel', id: expect.any(Number), runId: 2 })
    await flush()
    // Nothing after the abort reaches the caller.
    expect(partials).toEqual(['isa '])
    await expect(client.run('next')).resolves.toBe('next')
  })

  it('cancels a queued run without it ever running', async () => {
    const run = vi.fn(echoRuntime.run)
    const { client } = setup({ init: echoRuntime.init, run })
    await client.init(wasm)
    const controller = new AbortController()
    const first = client.run('una')
    const second = client.run('pangalawa', { signal: controller.signal })
    controller.abort()
    expect(await codeOf(second)).toBe('cancelled')
    await expect(first).resolves.toBe('una')
    await flush()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('rejects at once and posts no run when the signal is already aborted', async () => {
    const { client, worker } = setup()
    await client.init(wasm)
    const sentBefore = worker.sent.length
    const error = await failureOf(client.run('hi', { signal: AbortSignal.abort() }))
    expect(error.code).toBe('cancelled')
    expect(worker.sent).toHaveLength(sentBefore)
  })

  it('dispose terminates the worker and rejects pending and later calls with cancelled', async () => {
    const { client, worker } = setup()
    const init = codeOf(client.init(wasm))
    const run = codeOf(client.run('hi'))
    client.dispose()
    expect(worker.terminated).toBe(true)
    expect(await init).toBe('cancelled')
    expect(await run).toBe('cancelled')
    expect(await codeOf(client.run('later'))).toBe('cancelled')
    expect(await codeOf(client.init(wasm))).toBe('cancelled')
  })

  it('rejects with bad-request when the worker cannot read the request', async () => {
    const { client } = setup()
    const bogus = { kind: 'cuda' } as unknown as Backend
    expect(await codeOf(client.init(bogus))).toBe('bad-request')
  })

  it('rejects with bad-request when the input cannot be sent to the worker', async () => {
    const { client, worker } = setup()
    await client.init(wasm)
    const sentBefore = worker.sent.length
    expect(await codeOf(client.run(() => 'a function'))).toBe('bad-request')
    expect(worker.sent).toHaveLength(sentBefore)
  })

  it('fails pending calls when the worker errors, e.g. its script failed to load', async () => {
    const { client, worker } = setup()
    const init = failureOf(client.init(wasm))
    worker.dispatchEvent(new Event('error'))
    expect(await init).toMatchObject({
      code: 'init-failed',
      message: 'The inference worker failed to load or crashed.',
    })
  })

  it('accepts a real Worker', () => {
    expectTypeOf<Worker>().toExtend<WorkerLike>()
  })
})
