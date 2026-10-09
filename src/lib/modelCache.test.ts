import { describe, expect, it, vi } from 'vitest'
import {
  cacheNameFor,
  deleteCachedModel,
  ensureModelCached,
  evictOtherVersions,
  isModelCached,
  listCachedModels,
  ModelCacheError,
  readModelFile,
  type CacheStorageLike,
  type DownloadProgress,
  type ModelSpec,
} from './modelCache'

// In-memory Cache API. put() reads the whole body, so a stream error rejects it
// and nothing is stored, as in browsers.
function fakeCaches(options: { putError?: Error } = {}) {
  const store = new Map<string, Map<string, Response>>()
  const caches: CacheStorageLike = {
    async open(name) {
      let entries = store.get(name)
      if (!entries) {
        entries = new Map()
        store.set(name, entries)
      }
      const cache = entries
      return {
        async match(url) {
          return cache.get(url)?.clone()
        },
        async put(url, response) {
          const body = await response.arrayBuffer()
          if (options.putError) throw options.putError
          cache.set(url, new Response(body, { headers: response.headers }))
        },
        async delete(url) {
          return cache.delete(url)
        },
      }
    },
    async has(name) {
      return store.has(name)
    },
    async keys() {
      return [...store.keys()]
    },
    async delete(name) {
      return store.delete(name)
    },
  }
  return { caches, store }
}

function bytes(length: number, fill = 7) {
  return new Uint8Array(length).fill(fill)
}

// Serves each URL's bytes in 4-byte chunks; a number is an HTTP error status.
function fakeFetch(files: Record<string, Uint8Array | number>) {
  return vi.fn(async (url: string, init: RequestInit) => {
    if (init.signal?.aborted) throw init.signal.reason
    const file = files[url]
    if (file === undefined) throw new TypeError('Failed to fetch')
    if (typeof file === 'number') return new Response(null, { status: file })
    let offset = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= file.length) return controller.close()
        controller.enqueue(file.slice(offset, offset + 4))
        offset += 4
      },
    })
    return new Response(body, { headers: { 'content-type': 'application/octet-stream' } })
  })
}

const spec: ModelSpec = {
  id: 'org/tiny-model',
  version: 'q4-v1',
  files: [
    { url: 'https://models.example/tiny/weights.bin', bytes: 10 },
    { url: 'https://models.example/tiny/tokenizer.json', bytes: 6 },
  ],
}
const [weights, tokenizer] = spec.files

describe('ensureModelCached', () => {
  it('downloads every file with rising progress, then serves them from the cache', async () => {
    const { caches } = fakeCaches()
    const fetch = fakeFetch({ [weights.url]: bytes(10), [tokenizer.url]: bytes(6, 1) })
    const progress: DownloadProgress[] = []

    await ensureModelCached(spec, { caches, fetch, onProgress: (p) => progress.push(p) })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(progress[0]).toEqual({ loadedBytes: 0, totalBytes: 16, file: null })
    expect(progress.at(-1)).toEqual({
      loadedBytes: 16,
      totalBytes: 16,
      file: { url: tokenizer.url, index: 1, count: 2 },
    })
    expect(progress.find((p) => p.file?.index === 0)?.file?.url).toBe(weights.url)
    const loaded = progress.map((p) => p.loadedBytes)
    expect(loaded).toEqual([...loaded].sort((a, b) => a - b))

    expect(await isModelCached(spec, { caches })).toBe(true)
    const file = await readModelFile(spec, tokenizer, { caches })
    expect(new Uint8Array(await file!.arrayBuffer())).toEqual(bytes(6, 1))

    // Second load: nothing goes to the network.
    await ensureModelCached(spec, { caches, fetch })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('downloads only the missing files and counts cached ones toward progress', async () => {
    const { caches } = fakeCaches()
    await ensureModelCached(
      { ...spec, files: [weights] },
      { caches, fetch: fakeFetch({ [weights.url]: bytes(10) }) },
    )
    const fetch = fakeFetch({ [tokenizer.url]: bytes(6) })
    const progress: DownloadProgress[] = []

    await ensureModelCached(spec, { caches, fetch, onProgress: (p) => progress.push(p) })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(tokenizer.url, expect.anything())
    expect(progress[0]).toEqual({ loadedBytes: 10, totalBytes: 16, file: null })
    expect(progress.at(-1)).toMatchObject({ loadedBytes: 16, file: { index: 1, count: 2 } })
  })

  it('rejects a file that is too short or too long and stores nothing for it', async () => {
    for (const served of [bytes(8), bytes(13)]) {
      const { caches } = fakeCaches()
      const fetch = fakeFetch({ [weights.url]: served, [tokenizer.url]: bytes(6) })
      const error = await ensureModelCached(spec, { caches, fetch }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ModelCacheError)
      expect(error).toMatchObject({ code: 'size-mismatch', url: weights.url })
      expect(await readModelFile(spec, weights, { caches })).toBeNull()
      expect(await isModelCached(spec, { caches })).toBe(false)
    }
  })

  it('re-downloads a cached file whose expected size changed', async () => {
    const { caches } = fakeCaches()
    await ensureModelCached(
      { ...spec, files: [weights] },
      { caches, fetch: fakeFetch({ [weights.url]: bytes(10) }) },
    )
    const resized = { ...spec, files: [{ url: weights.url, bytes: 12 }] }
    const fetch = fakeFetch({ [weights.url]: bytes(12) })
    await ensureModelCached(resized, { caches, fetch })
    expect(fetch).toHaveBeenCalledOnce()
    expect(await isModelCached(resized, { caches })).toBe(true)
  })

  it('reports HTTP errors, network failures and a full disk with their own codes', async () => {
    const http = await ensureModelCached(spec, {
      caches: fakeCaches().caches,
      fetch: fakeFetch({ [weights.url]: 404 }),
    }).catch((e: unknown) => e)
    expect(http).toMatchObject({ code: 'http', url: weights.url })

    const offline = await ensureModelCached(spec, {
      caches: fakeCaches().caches,
      fetch: fakeFetch({}),
    }).catch((e: unknown) => e)
    expect(offline).toMatchObject({ code: 'network', url: weights.url })

    const full = await ensureModelCached(spec, {
      caches: fakeCaches({ putError: new DOMException('full', 'QuotaExceededError') }).caches,
      fetch: fakeFetch({ [weights.url]: bytes(10), [tokenizer.url]: bytes(6) }),
    }).catch((e: unknown) => e)
    expect(full).toMatchObject({ code: 'quota', url: weights.url })
  })

  it('passes the abort signal on and rethrows the AbortError untouched', async () => {
    const controller = new AbortController()
    controller.abort()
    const { caches } = fakeCaches()
    const error = await ensureModelCached(spec, {
      caches,
      fetch: fakeFetch({ [weights.url]: bytes(10) }),
      signal: controller.signal,
    }).catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'AbortError' })
    expect(error).not.toBeInstanceOf(ModelCacheError)
    expect(await isModelCached(spec, { caches })).toBe(false)
  })

  it('rejects invalid file sizes before downloading', async () => {
    const fetch = fakeFetch({})
    const bad = { ...spec, files: [{ url: weights.url, bytes: 0 }] }
    await expect(ensureModelCached(bad, { caches: fakeCaches().caches, fetch })).rejects.toThrow(RangeError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports unsupported when there is no Cache API', async () => {
    const error = await ensureModelCached(spec).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'unsupported' })
  })
})

describe('lookups', () => {
  it('do not create a cache for a model that was never downloaded', async () => {
    const { caches, store } = fakeCaches()
    expect(await isModelCached(spec, { caches })).toBe(false)
    expect(await readModelFile(spec, weights, { caches })).toBeNull()
    expect(store.size).toBe(0)
  })
})

describe('eviction', () => {
  async function cacheVersions(caches: CacheStorageLike, id: string, versions: string[]) {
    for (const version of versions) {
      await ensureModelCached(
        { id, version, files: [weights] },
        { caches, fetch: fakeFetch({ [weights.url]: bytes(10) }) },
      )
    }
  }

  it('lists cached models, including ids with a slash or an @', async () => {
    const { caches, store } = fakeCaches()
    await cacheVersions(caches, 'org/tiny-model', ['q4-v1'])
    await cacheVersions(caches, '@scope/model', ['v2'])
    store.set('workbox-precache-v2', new Map())
    expect(await listCachedModels({ caches })).toEqual([
      { id: 'org/tiny-model', version: 'q4-v1' },
      { id: '@scope/model', version: 'v2' },
    ])
  })

  it('evicts the other versions of the same model only', async () => {
    const { caches } = fakeCaches()
    await cacheVersions(caches, spec.id, ['q4-v0', 'q4-v1', 'q8-v1'])
    await cacheVersions(caches, 'other/model', ['v1'])
    expect(await evictOtherVersions(spec, { caches })).toEqual(['q4-v0', 'q8-v1'])
    expect(await listCachedModels({ caches })).toEqual([
      { id: spec.id, version: 'q4-v1' },
      { id: 'other/model', version: 'v1' },
    ])
  })

  it('deletes one version, or every version of a model', async () => {
    const { caches } = fakeCaches()
    await cacheVersions(caches, spec.id, ['a', 'b'])
    await cacheVersions(caches, 'other/model', ['a'])
    await deleteCachedModel(spec.id, 'a', { caches })
    expect(await listCachedModels({ caches })).toEqual([
      { id: spec.id, version: 'b' },
      { id: 'other/model', version: 'a' },
    ])
    await deleteCachedModel(spec.id, undefined, { caches })
    expect(await listCachedModels({ caches })).toEqual([{ id: 'other/model', version: 'a' }])
  })

  it('refuses a version containing @, which would make names ambiguous', () => {
    expect(() => cacheNameFor('model', 'v1@x')).toThrow(RangeError)
    expect(cacheNameFor('org/model', 'v1')).toBe('model-cache:org/model@v1')
  })
})
