import { ModelCacheError, type DownloadProgress, type ModelCacheErrorCode, type ModelSpec } from './modelCache'
import type { StorageCheck } from './storage'

// The model-loading flow behind the designed states:
// idle → checking-storage → downloading → verifying → ready, or error.
// Takes one model or several (the "Prepare for offline" step downloads every
// phone model in one go). Pure logic with injected dependencies;
// useModelDownload.ts wires the real ones.

export type ModelDownloadErrorCode =
  | ModelCacheErrorCode
  // The browser reports less free space than the download needs.
  | 'insufficient-storage'
  // Downloaded, but the files weren't all in the cache afterwards.
  | 'verify-failed'
  | 'unknown'

export type ModelDownloadState =
  | { status: 'idle' }
  | { status: 'checking-storage' }
  | {
      status: 'downloading'
      // Across every model still to download.
      loadedBytes: number
      totalBytes: number
      // The model and file downloading now; null before the first byte.
      modelId: string | null
      file: DownloadProgress['file']
    }
  | { status: 'verifying' }
  | { status: 'ready' }
  | {
      status: 'error'
      code: ModelDownloadErrorCode
      message: string
      // Set for 'insufficient-storage', so the screen can show how much is needed.
      storage: StorageCheck | null
      // How far the download got before it stopped (L9a: "The signal dropped at …").
      loadedBytes?: number
      totalBytes?: number
    }

export type ModelDownloadDeps = {
  isModelCached(spec: ModelSpec): Promise<boolean>
  prepareStorage(requiredBytes: number): Promise<StorageCheck>
  ensureModelCached(
    spec: ModelSpec,
    options: { signal: AbortSignal; onProgress: (progress: DownloadProgress) => void },
  ): Promise<void>
  holdReload(): () => void
}

const BUSY = new Set<ModelDownloadState['status']>(['checking-storage', 'downloading', 'verifying'])

const specBytes = (spec: ModelSpec) => spec.files.reduce((sum, file) => sum + file.bytes, 0)

export function createModelDownload(models: ModelSpec | ModelSpec[], deps: ModelDownloadDeps) {
  const specs = Array.isArray(models) ? models : [models]
  const allCached = async () => (await Promise.all(specs.map((spec) => deps.isModelCached(spec)))).every(Boolean)
  let state: ModelDownloadState = { status: 'idle' }
  let controller: AbortController | null = null
  const listeners = new Set<() => void>()

  function setState(next: ModelDownloadState) {
    state = next
    listeners.forEach((listener) => listener())
  }

  // Fast path, e.g. on mount: a cached model goes straight to ready, offline too.
  async function checkCached(): Promise<void> {
    if (state.status !== 'idle') return
    try {
      if ((await allCached()) && state.status === 'idle') setState({ status: 'ready' })
    } catch {
      // Stay idle; start() reports the error if the user tries.
    }
  }

  // Call from the user's click: asking for persistent storage can show a prompt.
  async function start(): Promise<void> {
    if (BUSY.has(state.status) || state.status === 'ready') return
    const abort = new AbortController()
    controller = abort
    // After cancel(), late results from this run are ignored.
    const update = (next: ModelDownloadState) => {
      if (!abort.signal.aborted) setState(next)
    }
    const release = deps.holdReload()
    let reached: { loadedBytes: number; totalBytes: number } | null = null
    update({ status: 'checking-storage' })
    try {
      const missing: ModelSpec[] = []
      for (const spec of specs) if (!(await deps.isModelCached(spec))) missing.push(spec)
      if (missing.length === 0) return update({ status: 'ready' })
      const totalBytes = missing.reduce((sum, spec) => sum + specBytes(spec), 0)

      const storage = await deps.prepareStorage(totalBytes)
      if (storage.fits === false) {
        return update({
          status: 'error',
          code: 'insufficient-storage',
          message: 'Not enough free storage for the models.',
          storage,
        })
      }

      // Progress arrives per network chunk; pass on at most one update per 0.1%,
      // plus every change of file.
      let lastStep = -1
      let lastFile = ''
      let doneBytes = 0
      reached = { loadedBytes: 0, totalBytes }
      update({ status: 'downloading', loadedBytes: 0, totalBytes, modelId: null, file: null })
      for (const spec of missing) {
        const before = doneBytes
        await deps.ensureModelCached(spec, {
          signal: abort.signal,
          onProgress: ({ loadedBytes, file }) => {
            const loaded = before + loadedBytes
            reached = { loadedBytes: loaded, totalBytes }
            const step = totalBytes === 0 ? 1000 : Math.floor((loaded / totalBytes) * 1000)
            const fileKey = `${spec.id}|${file?.index ?? -1}`
            if (step === lastStep && fileKey === lastFile) return
            lastStep = step
            lastFile = fileKey
            update({ status: 'downloading', loadedBytes: loaded, totalBytes, modelId: spec.id, file })
          },
        })
        doneBytes += specBytes(spec)
      }

      update({ status: 'verifying' })
      if (!(await allCached())) {
        return update({
          status: 'error',
          code: 'verify-failed',
          message: 'The models downloaded but are not all in the cache.',
          storage: null,
        })
      }
      update({ status: 'ready' })
    } catch (error) {
      if (abort.signal.aborted) return
      update({
        status: 'error',
        code: error instanceof ModelCacheError ? error.code : 'unknown',
        message: error instanceof Error ? error.message : String(error),
        storage: null,
        ...(reached ?? {}),
      })
    } finally {
      release()
      if (controller === abort) controller = null
    }
  }

  // Stops a download in progress and goes back to idle. Files already complete
  // stay cached, so the next start() resumes from them.
  function cancel() {
    if (!controller) return
    controller.abort()
    controller = null
    setState({ status: 'idle' })
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    checkCached,
    start,
    cancel,
    // Same as start(); named for the error state's retry button.
    retry: start,
  }
}

export type ModelDownload = ReturnType<typeof createModelDownload>
