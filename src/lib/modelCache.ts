// Downloads model files once and keeps them in the Cache API, so the next load
// is instant and works offline. Runtime-agnostic: it stores the files and hands
// back Responses, which a runtime reads as a buffer, blob or stream. Runtimes
// that cache their own downloads (WebLLM, Transformers.js) don't need it.
//
// One cache per model id + version ("model-cache:<id>@<version>"), each file
// keyed by its URL. An entry is only kept when its byte count matches the
// expected size. This is not the service worker precache, which skips files
// over 2 MiB. Call prepareStorageForDownload() (storage.ts) first, from the
// user's click.
//
// Memory: Chrome streams each file into the cache. WebKit (Safari, and every
// browser on iOS) collects a whole entry in memory before storing it, so on
// iPhone a single huge weights file can get the tab killed. Prefer models split
// into several smaller files, and test the real model on an iPhone.

export type ModelFile = {
  url: string
  // Exact size in bytes, from the model host's file listing. Checked on download.
  bytes: number
}

export type ModelSpec = {
  id: string
  version: string
  files: ModelFile[]
}

export type DownloadProgress = {
  loadedBytes: number
  totalBytes: number
  // The file being downloaded (index among spec.files); null before the first byte.
  file: { url: string; index: number; count: number } | null
}

export type ModelCacheErrorCode =
  // No Cache API (old browser, or the page isn't on HTTPS).
  | 'unsupported'
  // The download failed: offline, or the connection dropped.
  | 'network'
  // The server answered with an error status.
  | 'http'
  // The file's size didn't match the expected size; nothing was stored.
  | 'size-mismatch'
  // The device or browser ran out of storage for this site.
  | 'quota'

export class ModelCacheError extends Error {
  readonly code: ModelCacheErrorCode
  readonly url: string | undefined

  constructor(code: ModelCacheErrorCode, message: string, url?: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'ModelCacheError'
    this.code = code
    this.url = url
  }
}

// The parts of the Cache API we use. The real `caches` satisfies it; tests pass fakes.
export type CacheLike = {
  match(url: string): Promise<Response | undefined>
  put(url: string, response: Response): Promise<void>
  delete(url: string): Promise<boolean>
}

export type CacheStorageLike = {
  open(name: string): Promise<CacheLike>
  has(name: string): Promise<boolean>
  keys(): Promise<string[]>
  delete(name: string): Promise<boolean>
}

export type ModelCacheOptions = {
  // Called as bytes arrive (per network chunk); throttle UI updates if needed.
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
  caches?: CacheStorageLike
  fetch?: (url: string, init: RequestInit) => Promise<Response>
}

const CACHE_PREFIX = 'model-cache:'
// Stored with each file: the verified size, so a lookup needn't read the body.
const BYTES_HEADER = 'x-model-bytes'

export function cacheNameFor(id: string, version: string): string {
  if (!id || !version || version.includes('@')) {
    throw new RangeError(`Invalid model id or version: "${id}" "${version}"`)
  }
  return `${CACHE_PREFIX}${id}@${version}`
}

function parseCacheName(name: string): { id: string; version: string } | null {
  if (!name.startsWith(CACHE_PREFIX)) return null
  const rest = name.slice(CACHE_PREFIX.length)
  const at = rest.lastIndexOf('@')
  if (at <= 0 || at === rest.length - 1) return null
  return { id: rest.slice(0, at), version: rest.slice(at + 1) }
}

function getCacheStorage(options: { caches?: CacheStorageLike }): CacheStorageLike {
  if (options.caches) return options.caches
  if (typeof caches === 'undefined') {
    throw new ModelCacheError('unsupported', 'This browser has no Cache API, or the page is not on HTTPS.')
  }
  return caches
}

function checkSpec(spec: ModelSpec) {
  for (const file of spec.files) {
    if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0) {
      throw new RangeError(`Invalid size for ${file.url}: ${file.bytes}`)
    }
  }
}

async function isFileCached(cache: CacheLike, file: ModelFile): Promise<boolean> {
  const cached = await cache.match(file.url)
  return cached?.headers.get(BYTES_HEADER) === String(file.bytes)
}

function isQuotaError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'QuotaExceededError'
}

async function downloadFile(
  cache: CacheLike,
  file: ModelFile,
  options: ModelCacheOptions,
  onBytes: (loaded: number) => void,
): Promise<void> {
  const doFetch = options.fetch ?? ((url, init) => fetch(url, init))
  let sizeError: ModelCacheError | null = null
  try {
    const response = await doFetch(file.url, { signal: options.signal })
    if (!response.ok || !response.body) {
      // Free the connection instead of leaving the error body unread.
      await response.body?.cancel().catch(() => {})
      throw new ModelCacheError('http', `Download failed with HTTP ${response.status}.`, file.url)
    }

    let loaded = 0
    const failSize = (controller: TransformStreamDefaultController<Uint8Array>) => {
      sizeError = new ModelCacheError(
        'size-mismatch',
        `Expected ${file.bytes} bytes, got ${loaded}${loaded > file.bytes ? ' or more' : ''}.`,
        file.url,
      )
      // Erroring the stream makes cache.put reject, so the entry is never stored.
      controller.error(sizeError)
    }
    const counted = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          loaded += chunk.byteLength
          if (loaded > file.bytes) return failSize(controller)
          onBytes(loaded)
          controller.enqueue(chunk)
        },
        flush(controller) {
          if (loaded !== file.bytes) failSize(controller)
        },
      }),
    )
    const headers = new Headers({
      'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
      [BYTES_HEADER]: String(file.bytes),
    })
    await cache.put(file.url, new Response(counted, { headers }))
  } catch (error) {
    if (sizeError) throw sizeError
    if (error instanceof ModelCacheError) throw error
    // Chrome rejects cache.put with a NetworkError when the body stream is
    // aborted midway, so rethrow the abort reason itself.
    if (options.signal?.aborted) throw options.signal.reason ?? error
    if (isQuotaError(error)) {
      throw new ModelCacheError('quota', 'Not enough storage left for this download.', file.url, error)
    }
    throw new ModelCacheError('network', 'The download failed. Check the connection and try again.', file.url, error)
  }
  if (sizeError) {
    await cache.delete(file.url)
    throw sizeError
  }
}

// Downloads every file of the model that isn't cached yet. Files already cached
// count toward the progress at once, so a retry resumes from the last whole file.
// Rejects with a ModelCacheError, or the signal's AbortError when cancelled.
export async function ensureModelCached(spec: ModelSpec, options: ModelCacheOptions = {}): Promise<void> {
  checkSpec(spec)
  const storage = getCacheStorage(options)
  const cache = await storage.open(cacheNameFor(spec.id, spec.version))
  const totalBytes = spec.files.reduce((sum, file) => sum + file.bytes, 0)
  const count = spec.files.length
  const report = (loadedBytes: number, file: DownloadProgress['file']) =>
    options.onProgress?.({ loadedBytes, totalBytes, file })

  let doneBytes = 0
  const missing: ModelFile[] = []
  for (const file of spec.files) {
    if (await isFileCached(cache, file)) doneBytes += file.bytes
    else missing.push(file)
  }
  report(doneBytes, null)

  for (const file of missing) {
    const current = { url: file.url, index: spec.files.indexOf(file), count }
    await downloadFile(cache, file, options, (loaded) => report(doneBytes + loaded, current))
    doneBytes += file.bytes
  }
}

export async function isModelCached(
  spec: ModelSpec,
  options: { caches?: CacheStorageLike } = {},
): Promise<boolean> {
  const storage = getCacheStorage(options)
  const name = cacheNameFor(spec.id, spec.version)
  // has() first: open() would create an empty cache as a side effect.
  if (!(await storage.has(name))) return false
  const cache = await storage.open(name)
  for (const file of spec.files) {
    if (!(await isFileCached(cache, file))) return false
  }
  return true
}

// Returns the cached file for the runtime to read (arrayBuffer(), blob() or body),
// or null when it isn't cached with the expected size.
export async function readModelFile(
  spec: ModelSpec,
  file: ModelFile,
  options: { caches?: CacheStorageLike } = {},
): Promise<Response | null> {
  const storage = getCacheStorage(options)
  const name = cacheNameFor(spec.id, spec.version)
  if (!(await storage.has(name))) return null
  const cached = await (await storage.open(name)).match(file.url)
  return cached?.headers.get(BYTES_HEADER) === String(file.bytes) ? cached : null
}

export async function listCachedModels(
  options: { caches?: CacheStorageLike } = {},
): Promise<{ id: string; version: string }[]> {
  const names = await getCacheStorage(options).keys()
  return names.map(parseCacheName).filter((model) => model !== null)
}

// Deletes one version of a model, or every version when none is given.
export async function deleteCachedModel(
  id: string,
  version?: string,
  options: { caches?: CacheStorageLike } = {},
): Promise<void> {
  const storage = getCacheStorage(options)
  const names = await storage.keys()
  await Promise.all(
    names
      .filter((name) => {
        const model = parseCacheName(name)
        return model?.id === id && (version === undefined || model.version === version)
      })
      .map((name) => storage.delete(name)),
  )
}

// Frees the space held by older (or other) versions of this model.
// Returns the versions it deleted.
export async function evictOtherVersions(
  spec: ModelSpec,
  options: { caches?: CacheStorageLike } = {},
): Promise<string[]> {
  const storage = getCacheStorage(options)
  const stale = (await listCachedModels({ caches: storage })).filter(
    (model) => model.id === spec.id && model.version !== spec.version,
  )
  await Promise.all(stale.map((model) => storage.delete(cacheNameFor(model.id, model.version))))
  return stale.map((model) => model.version)
}
