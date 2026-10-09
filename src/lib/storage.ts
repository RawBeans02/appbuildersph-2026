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
  // false: the browser may clear the download later. null: no persistence API.
  persisted: boolean | null
}

// estimate() is approximate, and writes need some room to spare.
export const STORAGE_HEADROOM = 1.1

export async function prepareStorageForDownload(
  requiredBytes: number,
  nav: NavigatorLike = navigator,
): Promise<StorageCheck> {
  if (!Number.isFinite(requiredBytes) || requiredBytes < 0) {
    throw new RangeError(`requiredBytes must be a non-negative number, got ${requiredBytes}`)
  }
  // Persistence first: some browsers (Firefox) give persisted sites a larger quota.
  const persisted = await requestPersistentStorage(nav)
  const storage = await getStorageEstimate(nav)
  const availableBytes = storage?.availableBytes ?? null
  return {
    requiredBytes,
    availableBytes,
    fits: availableBytes === null ? null : availableBytes >= requiredBytes * STORAGE_HEADROOM,
    persisted,
  }
}
