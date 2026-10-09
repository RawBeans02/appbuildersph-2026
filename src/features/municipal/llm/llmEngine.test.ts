import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { wordingModelCached, notifyLaptopAiReadinessChanged } from '../laptopAi'
import type { WorkerRequest, WorkerResponse } from '../../../inference/protocol'
import { loadWordingEngine, OFFLINE_WORDING_CACHE_MISSING } from './llmEngine'
import { WORDING_WORKER_URL } from './workerAsset'

vi.mock('../laptopAi', () => ({
  wordingModelCached: vi.fn(),
  notifyLaptopAiReadinessChanged: vi.fn(),
}))

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  messages: WorkerRequest[] = []
  terminate = vi.fn()
  readonly url?: string | URL
  readonly options?: WorkerOptions
  constructor(url?: string | URL, options?: WorkerOptions) {
    super()
    this.url = url
    this.options = options
    FakeWorker.instances.push(this)
  }
  postMessage(message: WorkerRequest) { this.messages.push(message) }
  reply(data: WorkerResponse) { this.dispatchEvent(new MessageEvent('message', { data })) }
}
const cached = vi.mocked(wordingModelCached)
const readinessChanged = vi.mocked(notifyLaptopAiReadinessChanged)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
beforeEach(() => { cached.mockReset().mockResolvedValue(false); readinessChanged.mockReset() })
afterEach(() => { vi.unstubAllGlobals(); FakeWorker.instances = [] })
const backend = { kind: 'webgpu' as const, f16: true, reason: 'test' }

describe('wording worker lifecycle', () => {
  it('uses the shared worker URL and requests persistent storage without waiting online', async () => {
    const persist = vi.fn(() => new Promise<boolean>(() => {}))
    vi.stubGlobal('navigator', { onLine: true, storage: { persist } })
    vi.stubGlobal('Worker', FakeWorker)
    cached.mockResolvedValue(true)

    const loading = loadWordingEngine(backend, () => {})
    await flush()
    const worker = FakeWorker.instances[0]
    expect(persist).toHaveBeenCalledOnce()
    expect(worker.url).toBe(WORDING_WORKER_URL)
    expect(worker.options).toEqual({ type: 'module' })
    expect(cached).not.toHaveBeenCalled()

    worker.reply({ type: 'ready', id: worker.messages[0].id })
    await expect(loading).resolves.toBeDefined()
    await flush()
    expect(cached).toHaveBeenCalledWith(globalThis.caches, true)
    expect(readinessChanged).toHaveBeenCalledWith(true)
  })

  it('fails before worker creation when offline artifacts are incomplete', async () => {
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { onLine: false, storage: { persist } })
    vi.stubGlobal('Worker', FakeWorker)
    cached.mockResolvedValue(false)

    await expect(loadWordingEngine(backend, () => {})).rejects.toThrow(OFFLINE_WORDING_CACHE_MISSING)
    expect(cached).toHaveBeenCalledWith(globalThis.caches, true)
    expect(FakeWorker.instances).toHaveLength(0)
    expect(persist).not.toHaveBeenCalled()
  })

  it('allows offline initialization when the selected cache set is complete', async () => {
    vi.stubGlobal('navigator', { onLine: false, storage: { persist: vi.fn(async () => true) } })
    vi.stubGlobal('Worker', FakeWorker)
    cached.mockResolvedValue(true)

    const loading = loadWordingEngine(backend, () => {})
    await flush()
    const worker = FakeWorker.instances[0]
    expect(cached).toHaveBeenCalledWith(globalThis.caches, true)
    expect(worker.url).toBe(WORDING_WORKER_URL)
    worker.reply({ type: 'ready', id: worker.messages[0].id })
    await expect(loading).resolves.toBeDefined()
  })

  it('does not create a worker if cancellation arrives during the offline cache check', async () => {
    let finishCheck: (ready: boolean) => void = () => {}
    cached.mockReturnValue(new Promise((resolve) => { finishCheck = resolve }))
    vi.stubGlobal('navigator', { onLine: false, storage: { persist: vi.fn(async () => true) } })
    vi.stubGlobal('Worker', FakeWorker)
    const abort = new AbortController()
    const loading = loadWordingEngine(backend, () => {}, abort.signal)
    const rejected = expect(loading).rejects.toThrow('offline-stop')
    abort.abort(new Error('offline-stop'))
    finishCheck(true)
    await rejected
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('terminates a worker immediately when its pending initialization is aborted', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const abort = new AbortController()
    const progress = vi.fn()
    const loading = loadWordingEngine(backend, progress, abort.signal)
    const worker = FakeWorker.instances[0]
    const id = worker.messages[0].id
    const rejected = expect(loading).rejects.toThrow('shut down')
    abort.abort()
    await rejected
    expect(worker.terminate).toHaveBeenCalledOnce()
    worker.reply({ type: 'progress', id, progress: 0.5 })
    expect(progress).not.toHaveBeenCalled()
  })
  it('does not create a worker for an already aborted signal', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const abort = new AbortController()
    abort.abort()
    await expect(loadWordingEngine(backend, () => {}, abort.signal)).rejects.toThrow()
    expect(FakeWorker.instances).toHaveLength(0)
  })
  it('returns disposal for ready engines and releases their worker once', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const loading = loadWordingEngine(backend, () => {})
    const worker = FakeWorker.instances[0]
    worker.reply({ type: 'ready', id: worker.messages[0].id })
    const engine = await loading
    engine.dispose?.(); engine.dispose?.()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
