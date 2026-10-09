// 18c: which barangay QRs this laptop scanned in this browser session, so the
// merged view can mark the newest one "Just now" for the visit, and play its
// arrival once. Storage may be blocked: then nothing is marked.

const SCANNED = 'agapay.scannedThisSession'
const SHOWN = 'agapay.mergedShownNewest'

type SessionStore = Pick<Storage, 'getItem' | 'setItem'>

function store(): SessionStore | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

export function noteScanned(id: string, storage: SessionStore | null = store()): void {
  try {
    if (!storage) return
    const ids = scannedThisSession(storage)
    if (!ids.includes(id)) storage.setItem(SCANNED, JSON.stringify([...ids, id].slice(-20)))
  } catch {
    // Blocked storage: nothing to note.
  }
}

export function scannedThisSession(storage: SessionStore | null = store()): string[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(SCANNED) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

// The newest of `received` that was scanned in this session, or null.
export function newestScanned<T extends { id: string; receivedAt: string }>(
  received: readonly T[],
  storage: SessionStore | null = store(),
): T | null {
  const ids = new Set(scannedThisSession(storage))
  return received.filter((item) => ids.has(item.id)).reduce<T | null>((newest, item) => (!newest || item.receivedAt > newest.receivedAt ? item : newest), null)
}

// True the first time the merged view shows this newest QR (it plays `land`).
export function firstShowing(id: string, storage: SessionStore | null = store()): boolean {
  try {
    if (!storage || storage.getItem(SHOWN) === id) return false
    storage.setItem(SHOWN, id)
    return true
  } catch {
    return false
  }
}
