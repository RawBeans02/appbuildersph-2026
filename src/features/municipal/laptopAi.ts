import { useEffect, useState } from 'react'
import { checkWebGPU } from '../../lib/capabilities'
import { WORDING_MODEL_RECORDS, type WordingModelRecord } from './llm/model'
import { WORDING_WORKER_CACHE_NAME, WORDING_WORKER_URL } from './llm/workerAsset'

// These names match WebLLM's Cache API scopes and the Workbox runtime cache.
// WebLLM stays in its worker; the main thread only checks stored responses.
const CONFIG_CACHE = 'webllm/config'
const WASM_CACHE = 'webllm/wasm'
const MODEL_CACHE = 'webllm/model'
export const LAPTOP_AI_READINESS_CHANGED_EVENT = 'agapay:laptop-ai-readiness-changed'

type CacheLike = Pick<Cache, 'match'>
type Storage = Pick<CacheStorage, 'has' | 'open'>

function modelBase(record: WordingModelRecord): string {
  let model = record.model.endsWith('/') ? record.model : `${record.model}/`
  if (!model.match(/.+\/resolve\/.+\//)) model += 'resolve/main/'
  return new URL(model).href
}

async function openCache(storage: Storage, name: string): Promise<CacheLike | null> {
  if (!(await storage.has(name))) return null
  return storage.open(name)
}

async function activeShaderF16(): Promise<boolean | null> {
  try {
    const gpu = await checkWebGPU()
    return gpu.status === 'available' && !gpu.isFallbackAdapter ? gpu.shaderF16 : null
  } catch {
    return null
  }
}

function tokenizerUrl(config: unknown, base: string): string | null {
  const files = (config as { tokenizer_files?: unknown } | null)?.tokenizer_files
  if (!Array.isArray(files) || !files.every((file) => typeof file === 'string')) return null
  // Keep the same preference as WebLLM's asyncLoadTokenizer.
  const filename = files.includes('tokenizer.json')
    ? 'tokenizer.json'
    : files.includes('tokenizer.model')
      ? 'tokenizer.model'
      : null
  return filename ? new URL(filename, base).href : null
}

async function tensorFilesCached(cache: CacheLike, base: string): Promise<boolean> {
  const index = await cache.match(new URL('tensor-cache.json', base).href)
  if (!index) return false
  const records = (await index.json() as { records?: unknown }).records
  if (!Array.isArray(records) || records.length === 0) return false
  const urls = records.map((record) => {
    const dataPath = (record as { dataPath?: unknown } | null)?.dataPath
    return typeof dataPath === 'string' && dataPath.length > 0 ? new URL(dataPath, base).href : null
  })
  if (urls.some((url) => url === null)) return false
  const responses = await Promise.all(urls.map((url) => cache.match(url!)))
  return responses.every(Boolean)
}

// True only when this device's selected WebLLM build and its worker can all
// initialize offline. `shaderF16` is optional for readiness callers that do
// not already have a GPU result; in that case this function selects the build.
export async function wordingModelCached(
  storage: Storage | undefined = globalThis.caches,
  shaderF16?: boolean,
): Promise<boolean> {
  try {
    if (!storage) return false
    const selectedShaderF16 = shaderF16 ?? (await activeShaderF16())
    if (selectedShaderF16 === null) return false
    const record = selectedShaderF16 ? WORDING_MODEL_RECORDS.f16 : WORDING_MODEL_RECORDS.f32
    const base = modelBase(record)
    const [configCache, wasmCache, modelCache, workerCache] = await Promise.all([
      openCache(storage, CONFIG_CACHE),
      openCache(storage, WASM_CACHE),
      openCache(storage, MODEL_CACHE),
      openCache(storage, WORDING_WORKER_CACHE_NAME),
    ])
    if (!configCache || !wasmCache || !modelCache || !workerCache) return false

    const [configResponse, wasmResponse, workerResponse] = await Promise.all([
      configCache.match(new URL('mlc-chat-config.json', base).href),
      wasmCache.match(record.model_lib),
      workerCache.match(WORDING_WORKER_URL),
    ])
    if (!configResponse || !wasmResponse || !workerResponse) return false

    const config = await configResponse.json()
    const tokenizer = tokenizerUrl(config, base)
    if (!tokenizer || !(await modelCache.match(tokenizer))) return false
    return await tensorFilesCached(modelCache, base)
  } catch {
    // Storage can be unavailable, corrupt, or evicted between the checks.
    return false
  }
}

export function notifyLaptopAiReadinessChanged(ready: boolean): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<boolean>(LAPTOP_AI_READINESS_CHANGED_EVENT, { detail: ready }))
}

// Checked when a laptop screen opens and whenever the window gets focus back.
export function useLaptopAiReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      let value = false
      try {
        const gpu = await checkWebGPU()
        if (gpu.status === 'available' && !gpu.isFallbackAdapter) {
          value = await wordingModelCached(globalThis.caches, gpu.shaderF16)
        }
      } catch {
        value = false
      }
      if (!cancelled) setReady(value)
    }
    const onReadinessChanged = (event: Event) => {
      const ready = (event as CustomEvent<unknown>).detail
      if (typeof ready === 'boolean' && !cancelled) setReady(ready)
      else void check()
    }
    void check()
    window.addEventListener('focus', check)
    window.addEventListener(LAPTOP_AI_READINESS_CHANGED_EVENT, onReadinessChanged)
    return () => {
      cancelled = true
      window.removeEventListener('focus', check)
      window.removeEventListener(LAPTOP_AI_READINESS_CHANGED_EVENT, onReadinessChanged)
    }
  }, [])
  return ready
}
