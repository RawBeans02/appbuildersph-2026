import { describe, expect, it } from 'vitest'
import { startWorker, type WorkerLike } from './workerClient'

type Sent = { message: Record<string, unknown>; transfer?: Transferable[] }

function fakeWorker() {
  const listeners: Record<string, ((event: Event) => void)[]> = { message: [], error: [] }
  const sent: Sent[] = []
  let terminated = false
  const worker: WorkerLike = {
    postMessage: (message, transfer) => void sent.push({ message: message as Record<string, unknown>, transfer }),
    addEventListener: (type, listener) => void listeners[type].push(listener),
    terminate: () => void (terminated = true),
  }
  const emit = (data: unknown) => listeners.message.forEach((listener) => listener({ data } as MessageEvent))
  const crash = (message: string) =>
    listeners.error.forEach((listener) => listener({ message, preventDefault() {} } as unknown as ErrorEvent))
  return { worker, sent, emit, crash, isTerminated: () => terminated }
}

describe('worker client', () => {
  it('sends init, resolves on ready, and settles each request by its id', async () => {
    const fake = fakeWorker()
    const starting = startWorker<{ type: 'pose'; id: number; value: string }>(fake.worker)
    expect(fake.sent[0].message).toEqual({ type: 'init' })
    fake.emit({ type: 'ready' })
    const client = await starting

    const first = client.request({ type: 'frame' }, 'pose', [])
    const second = client.request({ type: 'frame' }, 'pose')
    expect(fake.sent.slice(1).map((s) => s.message.id)).toEqual([1, 2])
    fake.emit({ type: 'pose', id: 2, value: 'b' })
    fake.emit({ type: 'pose', id: 1, value: 'a' })
    await expect(first).resolves.toMatchObject({ value: 'a' })
    await expect(second).resolves.toMatchObject({ value: 'b' })
  })

  it('rejects a request answered with an error', async () => {
    const fake = fakeWorker()
    const starting = startWorker(fake.worker)
    fake.emit({ type: 'ready' })
    const client = await starting
    const call = client.request({ type: 'frame' }, 'pose')
    fake.emit({ type: 'frame-error', id: 1, message: 'bad frame' })
    await expect(call).rejects.toThrow('bad frame')
  })

  it('rejects the start on init-error or when the worker fails to load', async () => {
    const a = fakeWorker()
    const startA = startWorker(a.worker)
    a.emit({ type: 'init-error', message: 'no OffscreenCanvas' })
    await expect(startA).rejects.toThrow('no OffscreenCanvas')

    const b = fakeWorker()
    const startB = startWorker(b.worker)
    b.crash('Failed to load the worker script')
    await expect(startB).rejects.toThrow('Failed to load the worker script')
  })

  it('rejects pending and later requests once the worker dies or is stopped', async () => {
    const fake = fakeWorker()
    const starting = startWorker(fake.worker)
    fake.emit({ type: 'ready' })
    const client = await starting
    const call = client.request({ type: 'frame' }, 'pose')
    fake.crash('out of memory')
    await expect(call).rejects.toThrow('out of memory')
    await expect(client.request({ type: 'frame' }, 'pose')).rejects.toThrow('out of memory')

    const other = fakeWorker()
    const startOther = startWorker(other.worker)
    other.emit({ type: 'ready' })
    const stopped = await startOther
    stopped.terminate()
    expect(other.isTerminated()).toBe(true)
    await expect(stopped.request({ type: 'frame' }, 'pose')).rejects.toThrow('stopped')
  })
})
