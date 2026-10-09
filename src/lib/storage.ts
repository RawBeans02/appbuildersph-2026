import { getStorageEstimate, requestPersistentStorage, type NavigatorLike } from './capabilities'

// Before a large download (model weights): ask the browser to keep this site's
// storage, so it isn't cleared under storage pressure, then check the download
// fits. Call it from the user's click, since some browsers prompt for persistence.

export type StorageCheck = {
  requiredBytes: number
  // Free space the browser reports for this site. null: not reported.
  availableBytes: number | null
  // null: unknown, so the download can still fail with a quota error.
  fits: boolean | null
  // false: the browser may clear the download later. null: unknown (no
  // persistence API, or the user hasn't answered the browser's prompt yet).
  persisted: boolean | null
}

// estimate() is approximate, and writes need some room to spare.
export const STORAGE_HEADROOM = 1.1

// Firefox asks the user before persisting, and persist() only settles once they
// answer. Don't hold the download for it: a later answer still takes effect.
export const PERSIST_WAIT_MS = 3000

function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function prepareStorageForDownload(
  requiredBytes: number,
  nav: NavigatorLike = navigator,
  persistWaitMs = PERSIST_WAIT_MS,
): Promise<StorageCheck> {
  if (!Number.isFinite(requiredBytes) || requiredBytes < 0) {
    throw new RangeError(`requiredBytes must be a non-negative number, got ${requiredBytes}`)
  }
  // Persistence first: some browsers (Firefox) give persisted sites a larger quota.
  const persisted = await settleWithin(requestPersistentStorage(nav), persistWaitMs, null)
  const storage = await getStorageEstimate(nav)
  const availableBytes = storage?.availableBytes ?? null
  return {
    requiredBytes,
    availableBytes,
    fits: availableBytes === null ? null : availableBytes >= requiredBytes * STORAGE_HEADROOM,
    persisted,
  }
}
