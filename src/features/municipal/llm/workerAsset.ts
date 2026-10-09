// Main-thread metadata for the worker that performs local AI wording.
// Keep this separate from model.ts: model.ts is also bundled into the worker,
// while importing a worker URL from there would create a nested worker asset.
import wordingWorkerUrl from './webllm.worker.ts?worker&url'

export const WORDING_WORKER_URL = wordingWorkerUrl
export const WORDING_WORKER_CACHE_NAME = 'agapay-laptop-ai'
