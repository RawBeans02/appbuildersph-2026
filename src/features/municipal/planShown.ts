// 19f: the plan's rail draws only when its inputs (the received exports)
// changed since this laptop last showed the plan in this browser session,
// including the first time. Storage may be blocked: then it never animates.

const KEY = 'agapay.plan.shownBasis'

export function planChangedSinceShown(basisKey: string, storage: Pick<Storage, 'getItem'> | null = sessionStore()): boolean {
  try {
    return storage !== null && storage.getItem(KEY) !== basisKey
  } catch {
    return false
  }
}

export function rememberPlanShown(basisKey: string, storage: Pick<Storage, 'setItem'> | null = sessionStore()): void {
  try {
    storage?.setItem(KEY, basisKey)
  } catch {
    // Blocked storage: nothing to remember.
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}
