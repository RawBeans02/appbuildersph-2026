import { describe, expect, it, vi } from 'vitest'
import type { Backend } from '../lib/backend'
import { createEchoRuntime, echoRuntime } from './echoRuntime'
import { createWorkerHandler } from './handler'
import type { Runtime, WorkerResponse } from './protocol'

const wasm: Backend = { kind: 'wasm', threads: 1, reason: 'test', threadsReason: 'test' }

// Lets every queued microtask run; the echo runtime never uses real timers.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(runtime: Runtime = echoRuntime, onPost?: (response: WorkerResponse) => void) {
  const sent: WorkerResponse[] = []
  // Cloned as postMessage would, so output that can't cross the worker boundary fails here too.
  const handle = createWorkerHandler(runtime, (response) => {
    sent.push(structuredClone(response))
    onPost?.(response)
  })
  const of = (id: number) => sent.filter((response) => response.id === id)
  return { handle, sent, of }
}

const cancelled = (id: number) => ({ type: 'error', id, code: 'cancelled', message: 'The run was cancelled.' })

describe('createWorkerHandler: init', () => {
  it('reports init progress, then ready', async () => {
    const { handle, sent } = setup()
    handle({ type: 'init', id: 1, backend: wasm })
    await flush()
    expect(sent).toEqual([
      { type: 'progress', id: 1, progress: 0.5 },
      { type: 'progress', id: 1, progress: 1 },
      { type: 'ready', id: 1 },
    ])
  })

  it('passes the backend pick to the runtime', async () => {
    const init = vi.fn(async () => {})
    const { handle } = setup({ init, run: async () => null })
    handle({ type: 'init', id: 1, backend: wasm })
    await flush()
    expect(init).toHaveBeenCalledWith(wasm, expect.any(Function))
  })

  it('answers init-failed with the runtime error, and later runs get not-ready', async () => {
    const run = vi.fn(async () => 'never')
    const { handle, of } = setup({
      init: async () => {
        throw new Error('No GPU adapter')
      },
      run,
    })
    handle({ type: 'init', id: 1, backend: wasm })
    handle({ type: 'run', id: 2, input: 'hi' })
    await flush()
    expect(of(1)).toEqual([{ type: 'error', id: 1, code: 'init-failed', message: 'No GPU adapter' }])
    expect(of(2)).toMatchObject([{ type: 'error', code: 'not-ready' }])
    expect(run).not.toHaveBeenCalled()
  })
})

describe('createWorkerHandler: run', () => {
  it('streams the echo word by word, then returns the input', async () => {
    const { handle, of } = setup()
    handle({ type: 'init', id: 1, backend: wasm })
    await flush()
    handle({ type: 'run', id: 2, input: 'kumusta ka na' })
    await flush()
    expect(of(2)).toEqual([
      { type: 'progress', id: 2, progress: 1 / 3, partial: 'kumusta ' },
      { type: 'progress', id: 2, progress: 2 / 3, partial: 'ka ' },
      { type: 'progress', id: 2, progress: 1, partial: 'na' },
      { type: 'result', id: 2, output: 'kumusta ka na' },
    ])
  })

  it('answers not-ready to a run before any init, without calling the runtime', async () => {
    const run = vi.fn(async () => 'never')
    const { handle, sent } = setup({ init: async () => {}, run })
    handle({ type: 'run', id: 1, input: 'hi' })
    await flush()
    expect(sent).toMatchObject([{ type: 'error', id: 1, code: 'not-ready' }])
    expect(run).not.toHaveBeenCalled()
  })

  it('lets a run sent right after init wait for it', async () => {
    const { handle, sent } = setup()
    handle({ type: 'init', id: 1, backend: wasm })
    handle({ type: 'run', id: 2, input: 'oo' })
    await flush()
    expect(sent.filter((response) => response.type !== 'progress')).toEqual([
      { type: 'ready', id: 1 },
      { type: 'result', id: 2, output: 'oo' },
    ])
  })

  it('runs one at a time, in order', async () => {
    let active = 0
    let mostActive = 0
    const { handle, sent } = setup({
      init: echoRuntime.init,
      run: async (input, context) => {
        mostActive = Math.max(mostActive, ++active)
        try {
          return await echoRuntime.run(input as string, context)
        } finally {
          active--
        }
      },
    })
    handle({ type: 'init', id: 1, backend: wasm })
    handle({ type: 'run', id: 2, input: 'a b c' })
    handle({ type: 'run', id: 3, input: 'd e' })
    handle({ type: 'run', id: 4, input: 'f' })
    await flush()
    expect(mostActive).toBe(1)
    // Concurrent runs would interleave their progress; serialized ones can't.
    expect(sent.filter((response) => response.id > 1).map((response) => response.id)).toEqual([
      2, 2, 2, 2, 3, 3, 3, 4, 4,
    ])
  })

  it('answers run-failed with the runtime error, and keeps serving later runs', async () => {
    const { handle, of } = setup()
    handle({ type: 'init', id: 1, backend: wasm })
    handle({ type: 'run', id: 2, input: 42 })
    handle({ type: 'run', id: 3, input: 'sige' })
    await flush()
    expect(of(2)).toEqual([
      { type: 'error', id: 2, code: 'run-failed', message: 'The echo runtime only takes text.' },
    ])
    expect(of(3).at(-1)).toEqual({ type: 'result', id: 3, output: 'sige' })
  })

  it('answers run-failed when the output cannot be cloned, instead of never answering', async () => {
    const { handle, of } = setup({ init: async () => {}, run: async () => ({ callback: () => {} }) })
    handle({ type: 'init', id: 1, backend: wasm })
    handle({ type: 'run', id: 2, input: null })
    await flush()
    expect(of(2)).toMatchObject([{ type: 'error', id: 2, code: 'run-failed' }])
  })
})

describe('createWorkerHandler: cancel', () => {
  it('cancels a running run: aborts the runtime, answers cancelled, never a result', async () => {
    const run = vi.fn(echoRuntime.run)
    // Cancel as soon as run 2 reports its first word.
    const { handle, of } = setup({ init: echoRuntime.init, run }, (response) => {
      if (response.type === 'progress' && response.id === 2) handle({ type: 'cancel', id: 3, runId: 2 })
    })
    handle({ type: 'init', id: 1, backend: wasm })
    handle({ type: 'run', id: 2, input: 'isa dalawa tatlo' })
    handle({ type: 'run', id: 4, input: 'next' })
    await flush()
    expect(of(2)).toEqual([{ type: 'progress', id: 2, progress: 1 / 3, partial: 'isa ' }, cancelled(2)])
    expect(run.mock.calls[0][1].signal.aborted).toBe(true)
    await expect(run.mock.results[0].value).rejects.toMatchObject({ name: 'AbortError' })
    // The cancel itself gets no reply, and the queue moves on.
    expect(of(3)).toEqual([])
    expect(of(4).at(-1)).toEqual({ type: 'result', id: 4, output: 'next' })
  })

  it('cancels a queued run before it ever reaches the runtime', async () => {
    const run = vi.fn(echoRuntime.run)
    const { handle, of } = setup({ init: echoRuntime.init, run })
    handle({ type: 'init', id: 1, backend: wasm })
    handle({ type: 'run', id: 2, input: 'first' })
    handle({ type: 'run', id: 3, input: 'second' })
    handle({ type: 'cancel', id: 4, runId: 3 })
    await flush()
    expect(of(3)).toEqual([cancelled(3)])
    expect(run).toHaveBeenCalledTimes(1)
    expect(of(2).at(-1)).toEqual({ type: 'result', id: 2, output: 'first' })
  })

  it('starts the next run only once a cancelled run has really stopped', async () => {
    const events: string[] = []
    let finishSlow = () => {}
    // This runtime ignores the abort signal, as a stuck one might.
    const { handle, of } = setup({
      init: async () => {},
      run: async (input) => {
        events.push(`start ${input}`)
        if (input === 'slow') await new Promise<void>((resolve) => (finishSlow = resolve))
        events.push(`end ${input}`)
        return input
      },
    })
    handle({ type: 'init', id: 1, backend: wasm })
    handle({ type: 'run', id: 2, input: 'slow' })
    handle({ type: 'run', id: 3, input: 'next' })
    await flush()
    handle({ type: 'cancel', id: 4, runId: 2 })
    await flush()
    expect(of(2)).toEqual([cancelled(2)])
    expect(events).toEqual(['start slow'])

    finishSlow()
    await flush()
    expect(events).toEqual(['start slow', 'end slow', 'start next', 'end next'])
    expect(of(2)).toEqual([cancelled(2)])
    expect(of(3)).toEqual([{ type: 'result', id: 3, output: 'next' }])
  })

  it('ignores a cancel for an unknown or finished run', async () => {
    const { handle, sent } = setup()
    handle({ type: 'init', id: 1, backend: wasm })
    handle({ type: 'run', id: 2, input: 'tapos' })
    await flush()
    const before = sent.length
    handle({ type: 'cancel', id: 3, runId: 2 })
    handle({ type: 'cancel', id: 4, runId: 99 })
    handle({ type: 'cancel', id: 5, runId: 1 })
    await flush()
    expect(sent).toHaveLength(before)
  })
})

describe('createWorkerHandler: bad requests', () => {
  it.each([
    ['an unknown type', { type: 'train', id: 7 }],
    ['no type', { id: 7 }],
    ['init without a backend', { type: 'init', id: 7 }],
    ['init with an unknown backend', { type: 'init', id: 7, backend: { kind: 'cuda' } }],
    ['cancel without a runId', { type: 'cancel', id: 7 }],
  ])('answers bad-request to %s', async (_name, message) => {
    const { handle, sent } = setup()
    handle(message)
    await flush()
    expect(sent).toMatchObject([{ type: 'error', id: 7, code: 'bad-request' }])
  })

  it('answers bad-request to a run whose id is still in progress', async () => {
    const { handle, of } = setup()
    handle({ type: 'init', id: 1, backend: wasm })
    handle({ type: 'run', id: 2, input: 'una' })
    handle({ type: 'run', id: 2, input: 'ulit' })
    await flush()
    expect(of(2)[0]).toMatchObject({ type: 'error', code: 'bad-request' })
    expect(of(2).at(-1)).toEqual({ type: 'result', id: 2, output: 'una' })
  })

  it.each([
    ['null', null],
    ['a string', 'init'],
    ['no id', { type: 'init', backend: wasm }],
    ['a non-integer id', { type: 'run', id: '1', input: 'hi' }],
  ])('drops a message with %s, having no id to answer to', async (_name, message) => {
    const { handle, sent } = setup()
    handle(message)
    await flush()
    expect(sent).toEqual([])
  })
})

describe('createEchoRuntime', () => {
  it('pauses between steps when asked to, for watching progress in the UI', async () => {
    vi.useFakeTimers()
    try {
      const progress = vi.fn()
      const done = createEchoRuntime({ stepMs: 100 }).init(wasm, progress)
      await vi.advanceTimersByTimeAsync(100)
      expect(progress.mock.calls).toEqual([[0.5]])
      await vi.advanceTimersByTimeAsync(100)
      await done
      expect(progress.mock.calls).toEqual([[0.5], [1]])
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops at the next step with the signal reason once aborted', async () => {
    const controller = new AbortController()
    const partials: unknown[] = []
    const result = echoRuntime.run('a b c', {
      signal: controller.signal,
      onProgress: (_progress, partial) => {
        partials.push(partial)
        controller.abort(new Error('stop'))
      },
    })
    await expect(result).rejects.toThrow('stop')
    expect(partials).toEqual(['a '])
  })

  it('echoes empty text in one step', async () => {
    const onProgress = vi.fn()
    await expect(echoRuntime.run('', { signal: new AbortController().signal, onProgress })).resolves.toBe('')
    expect(onProgress.mock.calls).toEqual([[1, '']])
  })
})

describe('createWorkerHandler: init detail', () => {
  it('passes the detail a runtime reports while loading, such as MB fetched', async () => {
    const runtime: Runtime = {
      init: async (_backend, onProgress) => {
        onProgress(0.5, { fetchedMB: 120 })
        onProgress(0.9)
      },
      run: async (input) => input,
    }
    const posted: WorkerResponse[] = []
    const handle = createWorkerHandler(runtime, (response) => posted.push(response))
    handle({ type: 'init', id: 1, backend: wasm })
    await flush()
    expect(posted).toEqual([
      { type: 'progress', id: 1, progress: 0.5, partial: { fetchedMB: 120 } },
      { type: 'progress', id: 1, progress: 0.9 },
      { type: 'ready', id: 1 },
    ])
  })
})
