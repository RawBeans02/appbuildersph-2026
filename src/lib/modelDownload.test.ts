import { describe, expect, it, vi } from 'vitest'
import { ModelCacheError, type DownloadProgress, type ModelSpec } from './modelCache'
import { createModelDownload, type ModelDownloadDeps, type ModelDownloadState } from './modelDownload'
import type { StorageCheck } from './storage'

const spec: ModelSpec = {
  id: 'org/tiny-model',
  version: 'q4-v1',
  files: [
    { url: 'https://models.example/a.bin', bytes: 600 },
    { url: 'https://models.example/b.bin', bytes: 400 },
  ],
}

const roomy: StorageCheck = { requiredBytes: 1000, availableBytes: 5000, fits: true, persisted: true }

// A manual stand-in for the cache: the test decides when the download ends.
function fakeDeps(overrides: Partial<ModelDownloadDeps> = {}) {
  let cached = false
  let finishDownload: () => void = () => {}
  let failDownload: (error: unknown) => void = () => {}
  let emit: (progress: DownloadProgress) => void = () => {}
  let signal: AbortSignal | null = null
  const release = vi.fn()
  const deps = {
    isModelCached: vi.fn(async () => cached),
    prepareStorage: vi.fn(async () => roomy),
    ensureModelCached: vi.fn(
      (_spec: ModelSpec, options: { signal: AbortSignal; onProgress: (p: DownloadProgress) => void }) => {
        signal = options.signal
        emit = options.onProgress
        return new Promise<void>((resolve, reject) => {
          finishDownload = () => {
            cached = true
            resolve()
          }
          failDownload = reject
        })
      },
    ),
    holdReload: vi.fn(() => release),
    ...overrides,
  }
  return {
    deps,
    release,
    setCached: (value: boolean) => (cached = value),
    finish: () => finishDownload(),
    fail: (error: unknown) => failDownload(error),
    progress: (p: DownloadProgress) => emit(p),
    signal: () => signal,
  }
}

function record(download: ReturnType<typeof createModelDownload>) {
  const states: ModelDownloadState[] = []
  download.subscribe(() => states.push(download.getState()))
  return states
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createModelDownload', () => {
  it('goes from idle through storage check, download and verify to ready, holding reloads meanwhile', async () => {
    const fake = fakeDeps()
    const download = createModelDownload(spec, fake.deps)
    const states = record(download)
    expect(download.getState()).toEqual({ status: 'idle' })

    const done = download.start()
    await flush()
    expect(fake.deps.holdReload).toHaveBeenCalledOnce()
    expect(fake.deps.prepareStorage).toHaveBeenCalledWith(1000)
    fake.progress({ loadedBytes: 300, totalBytes: 1000, file: { url: spec.files[0].url, index: 0, count: 2 } })
    expect(download.getState()).toEqual({
      status: 'downloading',
      loadedBytes: 300,
      totalBytes: 1000,
      modelId: 'org/tiny-model',
      file: { url: spec.files[0].url, index: 0, count: 2 },
    })
    expect(fake.release).not.toHaveBeenCalled()

    fake.finish()
    await done
    expect(states.map((s) => s.status)).toEqual([
      'checking-storage',
      'downloading',
      'downloading',
      'verifying',
      'ready',
    ])
    expect(fake.release).toHaveBeenCalledOnce()
  })

  it('goes straight to ready on mount when the model is already cached, with no network', async () => {
    const fake = fakeDeps()
    fake.setCached(true)
    const download = createModelDownload(spec, fake.deps)
    await download.checkCached()
    expect(download.getState()).toEqual({ status: 'ready' })
    expect(fake.deps.prepareStorage).not.toHaveBeenCalled()
    expect(fake.deps.ensureModelCached).not.toHaveBeenCalled()
  })

  it('stays idle on mount when the model is not cached or the check fails', async () => {
    const download = createModelDownload(spec, fakeDeps().deps)
    await download.checkCached()
    expect(download.getState()).toEqual({ status: 'idle' })

    const broken = createModelDownload(
      spec,
      fakeDeps({ isModelCached: vi.fn(async () => Promise.reject(new Error('no cache'))) }).deps,
    )
    await broken.checkCached()
    expect(broken.getState()).toEqual({ status: 'idle' })
  })

  it('skips the download when start() finds the model already cached', async () => {
    const fake = fakeDeps()
    fake.setCached(true)
    const download = createModelDownload(spec, fake.deps)
    await download.start()
    expect(download.getState()).toEqual({ status: 'ready' })
    expect(fake.deps.ensureModelCached).not.toHaveBeenCalled()
    expect(fake.release).toHaveBeenCalledOnce()
  })

  it('stops with insufficient-storage, and the numbers, when the download does not fit', async () => {
    const tight: StorageCheck = { requiredBytes: 1000, availableBytes: 200, fits: false, persisted: false }
    const fake = fakeDeps({ prepareStorage: vi.fn(async () => tight) })
    const download = createModelDownload(spec, fake.deps)
    await download.start()
    expect(download.getState()).toMatchObject({ status: 'error', code: 'insufficient-storage', storage: tight })
    expect(fake.deps.ensureModelCached).not.toHaveBeenCalled()
  })

  it('downloads anyway when the browser does not report free space', async () => {
    const unknown: StorageCheck = { requiredBytes: 1000, availableBytes: null, fits: null, persisted: null }
    const fake = fakeDeps({ prepareStorage: vi.fn(async () => unknown) })
    const download = createModelDownload(spec, fake.deps)
    const done = download.start()
    await flush()
    fake.finish()
    await done
    expect(download.getState()).toEqual({ status: 'ready' })
  })

  it('reports model-cache errors by code and anything else as unknown', async () => {
    const fake = fakeDeps()
    const download = createModelDownload(spec, fake.deps)
    const done = download.start()
    await flush()
    fake.fail(new ModelCacheError('network', 'The download failed.', spec.files[1].url))
    await done
    expect(download.getState()).toEqual({
      status: 'error',
      code: 'network',
      message: 'The download failed.',
      storage: null,
      // How far it got, for "The signal dropped at …".
      loadedBytes: 0,
      totalBytes: 1000,
    })
    expect(fake.release).toHaveBeenCalledOnce()

    const other = fakeDeps()
    const second = createModelDownload(spec, other.deps)
    const secondDone = second.start()
    await flush()
    other.fail(new Error('boom'))
    await secondDone
    expect(second.getState()).toMatchObject({ status: 'error', code: 'unknown', message: 'boom' })
  })

  it('reports verify-failed when the files are missing after the download', async () => {
    const fake = fakeDeps({ isModelCached: vi.fn(async () => false) })
    const download = createModelDownload(spec, fake.deps)
    const done = download.start()
    await flush()
    fake.finish()
    await done
    expect(download.getState()).toMatchObject({ status: 'error', code: 'verify-failed' })
  })

  it('cancels at once: aborts the download, returns to idle and ignores late events', async () => {
    const fake = fakeDeps()
    const download = createModelDownload(spec, fake.deps)
    const done = download.start()
    await flush()
    download.cancel()
    expect(download.getState()).toEqual({ status: 'idle' })
    expect(fake.signal()?.aborted).toBe(true)

    fake.progress({ loadedBytes: 900, totalBytes: 1000, file: null })
    fake.fail(new DOMException('aborted', 'AbortError'))
    await done
    expect(download.getState()).toEqual({ status: 'idle' })
    expect(fake.release).toHaveBeenCalledOnce()
  })

  it('retries after an error and can reach ready', async () => {
    const fake = fakeDeps()
    const download = createModelDownload(spec, fake.deps)
    const first = download.start()
    await flush()
    fake.fail(new ModelCacheError('network', 'offline'))
    await first
    expect(download.getState()).toMatchObject({ status: 'error' })

    const second = download.retry()
    await flush()
    fake.finish()
    await second
    expect(download.getState()).toEqual({ status: 'ready' })
    expect(fake.deps.ensureModelCached).toHaveBeenCalledTimes(2)
  })

  it('downloads several models in one go, skipping the cached ones, with progress across all', async () => {
    const other: ModelSpec = { id: 'org/runtime', version: '1', files: [{ url: 'https://models.example/rt.wasm', bytes: 500 }] }
    const cached = new Set<string>([spec.id])
    const ensured: string[] = []
    const download = createModelDownload([spec, other], {
      isModelCached: vi.fn(async (s: ModelSpec) => cached.has(s.id)),
      prepareStorage: vi.fn(async (bytes: number) => ({ ...roomy, requiredBytes: bytes })),
      ensureModelCached: vi.fn(async (s: ModelSpec, { onProgress }) => {
        ensured.push(s.id)
        onProgress({ loadedBytes: 250, totalBytes: 500, file: { url: s.files[0].url, index: 0, count: 1 } })
        cached.add(s.id)
      }),
      holdReload: () => () => {},
    })
    const states = record(download)
    await download.start()
    expect(ensured).toEqual(['org/runtime'])
    expect(states.find((s) => s.status === 'downloading' && s.loadedBytes === 250)).toMatchObject({
      totalBytes: 500,
      modelId: 'org/runtime',
    })
    expect(download.getState()).toEqual({ status: 'ready' })
  })

  it('goes ready on mount only when every model is cached', async () => {
    const other: ModelSpec = { id: 'org/runtime', version: '1', files: [{ url: 'x', bytes: 1 }] }
    const partly = createModelDownload([spec, other], {
      ...fakeDeps().deps,
      isModelCached: vi.fn(async (s: ModelSpec) => s.id === spec.id),
    })
    await partly.checkCached()
    expect(partly.getState()).toEqual({ status: 'idle' })
  })

  it('ignores start() while a download is running or after ready', async () => {
    const fake = fakeDeps()
    const download = createModelDownload(spec, fake.deps)
    const done = download.start()
    await download.start()
    await flush()
    await download.start()
    fake.finish()
    await done
    await download.start()
    expect(fake.deps.ensureModelCached).toHaveBeenCalledOnce()
    expect(fake.deps.holdReload).toHaveBeenCalledOnce()
  })

  it('passes on at most one progress update per 0.1%, plus each change of file', async () => {
    const fake = fakeDeps()
    const download = createModelDownload(spec, fake.deps)
    const states = record(download)
    const done = download.start()
    await flush()
    const first = { url: spec.files[0].url, index: 0, count: 2 }
    const second = { url: spec.files[1].url, index: 1, count: 2 }
    for (let loaded = 1; loaded <= 600; loaded += 1) fake.progress({ loadedBytes: loaded, totalBytes: 1000, file: first })
    for (let loaded = 601; loaded <= 1000; loaded += 1) fake.progress({ loadedBytes: loaded, totalBytes: 1000, file: second })
    fake.finish()
    await done
    const downloading = states.filter((s) => s.status === 'downloading')
    // One per whole 0.1% step (1000 steps here, one byte each), plus the initial 0.
    expect(downloading.length).toBeLessThanOrEqual(1001)

    const coarse = fakeDeps()
    const coarseDownload = createModelDownload({ ...spec, files: [{ url: 'x', bytes: 1_000_000 }] }, coarse.deps)
    const coarseStates = record(coarseDownload)
    const coarseDone = coarseDownload.start()
    await flush()
    for (let loaded = 1; loaded <= 10_000; loaded += 1) {
      coarse.progress({ loadedBytes: loaded, totalBytes: 1_000_000, file: { url: 'x', index: 0, count: 1 } })
    }
    coarse.finish()
    await coarseDone
    // 10,000 bytes of 1,000,000 is 1%: 10 steps of 0.1%, plus the first event and the initial 0.
    expect(coarseStates.filter((s) => s.status === 'downloading').length).toBe(12)
  })
})
