import { describe, expect, it, vi } from 'vitest'
import type { WebGPUSupport } from '../../../lib/capabilities'
import { createWording, parseFetchedMB, type LlmEngine, type LoadProgress } from './wording'

const gpu: WebGPUSupport = {
  status: 'available',
  shaderF16: true,
  isFallbackAdapter: false,
  maxBufferSize: 2 ** 30,
  maxStorageBufferBindingSize: 2 ** 30,
  vendor: 'test',
  architecture: 'test',
}

const TEMPLATE = 'Doctor teams: 1. Maligaya-D (12 residents in the watch window). This plan does not diagnose anyone and sets no dose.'
const PLAN = { priority: [{ name: 'Maligaya-D', score: { min: 12, max: 12 } }], moves: [] }
const KNOWN = ['Maligaya-D', 'Mabini-D']
const GOOD = 'Send the first doctor team to Maligaya-D, which has 12 residents in the watch window. This plan does not diagnose anyone and sets no dose.'

function fakeEngine(reply: string | ((signal: AbortSignal) => Promise<string>)): LlmEngine {
  return {
    complete: vi.fn(async (_messages, { onText, signal }) => {
      if (typeof reply !== 'string') return reply(signal)
      onText(reply.slice(0, 10))
      return reply
    }),
  }
}

function setup(engine: LlmEngine, support: WebGPUSupport = gpu) {
  let progress: ((p: LoadProgress) => void) | null = null
  let finishLoad: () => void = () => {}
  const loadEngine = vi.fn((onProgress: (p: LoadProgress) => void) => {
    progress = onProgress
    return new Promise<LlmEngine>((resolve) => (finishLoad = () => resolve(engine)))
  })
  let clock = 0
  const wording = createWording({ gpu: async () => support, loadEngine, now: () => (clock += 500) })
  const states: string[] = []
  wording.subscribe(() => states.push(wording.getState().status))
  return { wording, loadEngine, states, progress: (p: LoadProgress) => progress?.(p), finishLoad: () => finishLoad() }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createWording', () => {
  it('is unavailable without WebGPU or on a software adapter, and never loads the model', async () => {
    for (const support of [{ status: 'unsupported' }, { ...gpu, isFallbackAdapter: true }] as WebGPUSupport[]) {
      const { wording, loadEngine } = setup(fakeEngine(GOOD), support)
      await wording.checkAvailable()
      expect(wording.getState().status).toBe('unavailable')
      await wording.draft(TEMPLATE, PLAN, KNOWN)
      expect(loadEngine).not.toHaveBeenCalled()
    }
  })

  it('downloads with the measured MB, loads, drafts, and accepts a faithful draft', async () => {
    const { wording, states, progress, finishLoad } = setup(fakeEngine(GOOD))
    await wording.checkAvailable()
    const done = wording.draft(TEMPLATE, PLAN, KNOWN)
    await flush()
    progress({ progress: 0.4, fetchedMB: 120.5 })
    expect(wording.getState()).toEqual({ status: 'downloading', progress: 0.4, fetchedMB: 120.5 })
    progress({ progress: 1, fetchedMB: 301 })
    finishLoad()
    await done
    expect(states).toEqual(['idle', 'loading', 'downloading', 'loading', 'drafting', 'drafting', 'done'])
    expect(wording.getState()).toEqual({ status: 'done', text: GOOD, check: { ok: true }, ms: 500, template: TEMPLATE })
  })

  it('marks a draft that adds a number or a dose as rejected, so the template stays', async () => {
    const { wording, finishLoad } = setup(fakeEngine(`${GOOD} Give 2 capsules per person.`))
    await wording.checkAvailable()
    const done = wording.draft(TEMPLATE, PLAN, KNOWN)
    finishLoad()
    await done
    const state = wording.getState()
    expect(state.status === 'done' && state.check.ok).toBe(false)
  })

  it('reuses the loaded model for the next draft', async () => {
    const { wording, loadEngine, finishLoad } = setup(fakeEngine(GOOD))
    await wording.checkAvailable()
    const first = wording.draft(TEMPLATE, PLAN, KNOWN)
    finishLoad()
    await first
    await wording.draft(TEMPLATE, PLAN, KNOWN)
    expect(loadEngine).toHaveBeenCalledOnce()
  })

  it('cancels a draft back to idle and ignores its late result', async () => {
    let release: (text: string) => void = () => {}
    const engine = fakeEngine((signal) => new Promise((resolve, reject) => {
      release = resolve
      signal.addEventListener('abort', () => reject(new Error('interrupted')))
    }))
    const { wording, finishLoad } = setup(engine)
    await wording.checkAvailable()
    const done = wording.draft(TEMPLATE, PLAN, KNOWN)
    finishLoad()
    await flush()
    expect(wording.getState().status).toBe('drafting')
    wording.cancel()
    release(GOOD)
    await done
    expect(wording.getState()).toEqual({ status: 'idle' })
  })

  it('reports a failed model load as an error', async () => {
    const wording = createWording({ gpu: async () => gpu, loadEngine: async () => Promise.reject(new Error('quota exceeded')) })
    await wording.checkAvailable()
    await wording.draft(TEMPLATE, PLAN, KNOWN)
    expect(wording.getState()).toEqual({ status: 'error', message: 'quota exceeded' })
  })
})

describe('parseFetchedMB', () => {
  it('reads the MB WebLLM reports', () => {
    expect(parseFetchedMB('Fetching param cache[12/22]: 302MB fetched. 40% completed, 12 secs elapsed.')).toBe(302)
    expect(parseFetchedMB('Loading model from cache[3/22]: 45.5 MB fetched')).toBe(45.5)
    expect(parseFetchedMB('Finish loading on WebGPU - apple')).toBeNull()
  })
})
