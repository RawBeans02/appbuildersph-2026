import { useEffect, useState, useSyncExternalStore } from 'react'
import { appShell } from './appShell'
import { ensureModelCached, isModelCached, type ModelSpec } from './modelCache'
import { createModelDownload, type ModelDownloadDeps } from './modelDownload'
import { prepareStorageForDownload } from './storage'
import { announceModelsChanged } from './useModelsPrepared'

export const browserModelDownloadDeps: ModelDownloadDeps = {
  isModelCached: (spec) => isModelCached(spec),
  prepareStorage: (requiredBytes) => prepareStorageForDownload(requiredBytes),
  ensureModelCached: (spec, options) => ensureModelCached(spec, options),
  // A deploy landing mid-download must not reload the page under it.
  holdReload: () => appShell.holdReload(),
}

// One model or several. The first value wins for the component's lifetime; to
// switch models, give the component a new key. Unmounting cancels a download.
export function useModelDownload(models: ModelSpec | ModelSpec[]) {
  const [download] = useState(() => createModelDownload(models, browserModelDownloadDeps))
  const state = useSyncExternalStore(download.subscribe, download.getState, download.getState)

  useEffect(() => {
    void download.checkCached()
    return download.cancel
  }, [download])

  // Tell indicators (LocalStatus) once the download is ready.
  useEffect(() => {
    if (state.status === 'ready') announceModelsChanged()
  }, [state.status])

  return { state, start: download.start, cancel: download.cancel, retry: download.retry }
}
