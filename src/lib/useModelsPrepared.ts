import { useEffect, useState } from 'react'
import { isModelCached } from './modelCache'
import { offlineModels } from './offlineModels'

// Whether this device's on-device AI is downloaded (every model registered for
// it is in the model cache). null while checking, or when the browser has no
// Cache API. The "Prepare for offline" flow announces a change with
// announceModelsChanged(), so indicators update without a reload.

const EVENT = 'agapay:models-changed'

export function announceModelsChanged() {
  window.dispatchEvent(new Event(EVENT))
}

export async function modelsPrepared(device: 'phone' | 'laptop'): Promise<boolean | null> {
  const models = offlineModels.filter((model) => model.device === device)
  try {
    return (await Promise.all(models.map((model) => isModelCached(model)))).every(Boolean)
  } catch {
    return null
  }
}

export function useModelsPrepared(device: 'phone' | 'laptop' = 'phone'): boolean | null {
  const [prepared, setPrepared] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    const check = () => void modelsPrepared(device).then((value) => !cancelled && setPrepared(value))
    check()
    window.addEventListener(EVENT, check)
    return () => {
      cancelled = true
      window.removeEventListener(EVENT, check)
    }
  }, [device])
  return prepared
}
