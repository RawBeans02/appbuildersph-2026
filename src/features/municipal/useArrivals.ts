import { useCallback, useState } from 'react'
import { arrivals } from './loop'

// The keys that arrived while the officer was watching: in `keys` now, not in
// the list before. The first list (the screen opening) brings none, so
// nothing moves on load. `settle(key)` drops one when its animation ends
// (A4 rule 3: the trigger goes away on animationend).
export function useArrivals(keys: readonly string[] | null): [string[], (key: string) => void] {
  const id = keys ? keys.join('\n') : null
  const [seen, setSeen] = useState<{ id: string | null; keys: readonly string[] | null }>({ id, keys })
  const [arrived, setArrived] = useState<string[]>([])
  if (id !== seen.id) {
    setSeen({ id, keys })
    const fresh = keys ? arrivals(seen.keys, keys) : []
    if (fresh.length > 0) setArrived(fresh)
  }
  const settle = useCallback((key: string) => setArrived((list) => list.filter((item) => item !== key)), [])
  return [arrived, settle]
}
