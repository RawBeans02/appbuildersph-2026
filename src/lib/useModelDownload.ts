import { useEffect, useState, useSyncExternalStore } from 'react'
import { appShell } from './appShell'
import { ensureModelCached, isModelCached, type ModelSpec } from './modelCache'
import { createModelDownload, type ModelDownloadDeps } from './modelDownload'
import { prepareStorageForDownload } from './storage'

const browserDeps: ModelDownloadDeps = {
  isModelCached: (spec) => isModelCached(spec),
  prepareStorage: (requiredBytes) => prepareStorageForDownload(requiredBytes),
  ensureModelCached: (spec, options) => ensureModelCached(spec, options),
  // A deploy landing mid-download must not reload the page under it.
  holdReload: () => appShell.holdReload(),
}

// The first spec wins for the component's lifetime; to switch models, give the
// component a key of the model id + version. Unmounting cancels a download.
export function useModelDownload(spec: ModelSpec) {
  const [download] = useState(() => createModelDownload(spec, browserDeps))
  const state = useSyncExternalStore(download.subscribe, download.getState, download.getState)

  useEffect(() => {
    void download.checkCached()
    return download.cancel
  }, [download])

  return { state, start: download.start, cancel: download.cancel, retry: download.retry }
}
