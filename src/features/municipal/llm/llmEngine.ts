import { createInferenceClient } from '../../../inference/client'
import type { Backend } from '../../../lib/backend'
import { notifyLaptopAiReadinessChanged, wordingModelCached } from '../laptopAi'
import { WORDING_WORKER_URL } from './workerAsset'
import type { LlmEngine, LoadProgress } from './wording'

// The main-thread side: starts the AI wording's worker and turns it into the
// LlmEngine the panel's state machine uses. No WebLLM code on this side.

export const OFFLINE_WORDING_CACHE_MISSING =
  "The writing AI isn't fully saved on this laptop yet. Connect to the internet and try again."

let persistenceRequested = false

function requestPersistentStorage(): void {
  if (persistenceRequested || typeof navigator === 'undefined') return
  const storage = navigator.storage
  if (!storage?.persist) return
  persistenceRequested = true
  try {
    // Do not hold the model load on a permission prompt or unsupported API.
    void storage.persist().catch(() => false)
  } catch {
    // Persistence is best-effort; model loading remains available either way.
  }
}

function untilAborted<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => {
      cleanup()
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    pending.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

export async function loadWordingEngine(
  backend: Backend,
  onProgress: (progress: LoadProgress) => void,
  signal?: AbortSignal,
): Promise<LlmEngine> {
  signal?.throwIfAborted()
  if (typeof navigator !== 'undefined' && navigator.onLine === false && backend.kind === 'webgpu') {
    let cached: boolean
    try {
      cached = await untilAborted(wordingModelCached(globalThis.caches, backend.f16), signal)
    } catch {
      cached = false
    }
    signal?.throwIfAborted()
    if (!cached) {
      notifyLaptopAiReadinessChanged(false)
      throw new Error(OFFLINE_WORDING_CACHE_MISSING)
    }
  }
  signal?.throwIfAborted()
  requestPersistentStorage()
  const worker = new Worker(WORDING_WORKER_URL, { type: 'module' })
  const client = createInferenceClient(worker)
  const stop = () => client.dispose()
  signal?.addEventListener('abort', stop, { once: true })
  try {
    await client.init(backend, {
      onProgress: (progress, partial) =>
        onProgress({ progress, fetchedMB: (partial as { fetchedMB?: number | null } | undefined)?.fetchedMB ?? null }),
    })
    // Initialization has completed, so verify that all WebLLM artifacts and
    // the worker are present in persistent caches. Keep this off the load path.
    const shaderF16 = backend.kind === 'webgpu' && backend.f16
    void wordingModelCached(globalThis.caches, shaderF16).then(
      (ready) => {
        if (!signal?.aborted) notifyLaptopAiReadinessChanged(ready)
      },
      () => {
        if (!signal?.aborted) notifyLaptopAiReadinessChanged(false)
      },
    )
  } catch (error) {
    client.dispose()
    throw error
  } finally {
    signal?.removeEventListener('abort', stop)
  }
  return {
    dispose: () => client.dispose(),
    complete: (messages, { maxTokens, signal, onText }) =>
      client.run<string>(
        { messages, maxTokens },
        { signal, onProgress: (_progress, partial) => typeof partial === 'string' && onText(partial) },
      ),
  }
}
