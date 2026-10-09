import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from '../../../inference/protocol'
import { loadWordingEngine } from './llmEngine'

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  messages: WorkerRequest[] = []
  terminate = vi.fn()
  constructor() { super(); FakeWorker.instances.push(this) }
  postMessage(message: WorkerRequest) { this.messages.push(message) }
  reply(data: WorkerResponse) { this.dispatchEvent(new MessageEvent('message', { data })) }
}
afterEach(() => { vi.unstubAllGlobals(); FakeWorker.instances = [] })
const backend = { kind: 'webgpu' as const, f16: true, reason: 'test' }

describe('wording worker lifecycle', () => {
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
