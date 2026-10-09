import { ModelCacheError, type DownloadProgress, type ModelCacheErrorCode, type ModelSpec } from './modelCache'
import type { StorageCheck } from './storage'

// The model-loading flow behind the designed states:
// idle → checking-storage → downloading → verifying → ready, or error.
// Pure logic with injected dependencies; useModelDownload.ts wires the real ones.

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
      loadedBytes: number
      totalBytes: number
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

export function createModelDownload(spec: ModelSpec, deps: ModelDownloadDeps) {
  const totalBytes = spec.files.reduce((sum, file) => sum + file.bytes, 0)
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
      if ((await deps.isModelCached(spec)) && state.status === 'idle') setState({ status: 'ready' })
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
    update({ status: 'checking-storage' })
    try {
      if (await deps.isModelCached(spec)) return update({ status: 'ready' })

      const storage = await deps.prepareStorage(totalBytes)
      if (storage.fits === false) {
        return update({
          status: 'error',
          code: 'insufficient-storage',
          message: 'Not enough free storage for the model.',
          storage,
        })
      }

      // Progress arrives per network chunk; pass on at most one update per 0.1%,
      // plus every change of file.
      let lastStep = -1
      let lastFile = -1
      update({ status: 'downloading', loadedBytes: 0, totalBytes, file: null })
      await deps.ensureModelCached(spec, {
        signal: abort.signal,
        onProgress: ({ loadedBytes, file }) => {
          const step = totalBytes === 0 ? 1000 : Math.floor((loadedBytes / totalBytes) * 1000)
          const fileIndex = file?.index ?? -1
          if (step === lastStep && fileIndex === lastFile) return
          lastStep = step
          lastFile = fileIndex
          update({ status: 'downloading', loadedBytes, totalBytes, file })
        },
      })

      update({ status: 'verifying' })
      if (!(await deps.isModelCached(spec))) {
        return update({
          status: 'error',
          code: 'verify-failed',
          message: 'The model downloaded but is not in the cache.',
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
