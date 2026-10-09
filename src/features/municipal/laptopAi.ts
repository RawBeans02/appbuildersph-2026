import { useEffect, useState } from 'react'
import { WORDING_MODEL } from './llm/model'

// "Runs on this laptop" shows once the laptop's AI (the writing model, B6)
// is saved on this laptop. WebLLM keeps a model's files in the Cache API
// under "webllm/model", listed in the model's tensor-cache.json; this makes
// the same check as WebLLM's own hasModelInCache, here, so the main thread
// never loads the WebLLM library.

const MODEL_CACHE = 'webllm/model'
const modelBase = (id: string) => `https://huggingface.co/mlc-ai/${id}/resolve/main/`

type Storage = Pick<CacheStorage, 'has' | 'open'>

export async function wordingModelCached(storage: Storage | undefined = globalThis.caches): Promise<boolean> {
  try {
    if (!storage || !(await storage.has(MODEL_CACHE))) return false
    const cache = await storage.open(MODEL_CACHE)
    for (const id of Object.values(WORDING_MODEL)) {
      const base = modelBase(id)
      const index = await cache.match(new URL('tensor-cache.json', base).href)
      if (!index) continue
      const { records } = (await index.json()) as { records?: { dataPath?: unknown }[] }
      if (!Array.isArray(records) || records.length === 0) continue
      const files = records.map((record) => (typeof record.dataPath === 'string' ? new URL(record.dataPath, base).href : null))
      if (files.includes(null)) continue
      const found = await Promise.all(files.map((url) => cache.match(url as string)))
      if (found.every(Boolean)) return true
    }
    return false
  } catch {
    return false
  }
}

// Checked when a laptop screen opens and whenever the window gets focus
// back (after the first draft has downloaded the model).
export function useLaptopAiReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    const check = () => void wordingModelCached().then((value) => !cancelled && setReady(value))
    check()
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      window.removeEventListener('focus', check)
    }
  }, [])
  return ready
}
