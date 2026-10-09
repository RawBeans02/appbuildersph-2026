import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkCapabilities,
  checkWebGPU,
  getStorageEstimate,
  isStoragePersisted,
  requestPersistentStorage,
  type NavigatorLike,
} from './capabilities'

function fakeAdapter(features: string[] = [], isFallbackAdapter = false) {
  return {
    features: new Set(features),
    limits: { maxBufferSize: 4_294_967_296, maxStorageBufferBindingSize: 2_147_483_648 },
    info: { vendor: 'apple', architecture: 'metal-3', isFallbackAdapter },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkWebGPU', () => {
  it('reports unsupported when the browser has no WebGPU API', async () => {
    expect(await checkWebGPU({})).toEqual({ status: 'unsupported' })
  })

  it('reports no-adapter when the browser returns no adapter', async () => {
    const nav: NavigatorLike = { gpu: { requestAdapter: async () => null } }
    expect(await checkWebGPU(nav)).toEqual({ status: 'no-adapter' })
  })

  it('reports no-adapter when requesting an adapter throws', async () => {
    const nav: NavigatorLike = {
      gpu: { requestAdapter: () => Promise.reject(new Error('GPU process crashed')) },
    }
    expect(await checkWebGPU(nav)).toEqual({ status: 'no-adapter' })
  })

  it('reports no-adapter when the adapter request hangs past the timeout', async () => {
    const nav: NavigatorLike = { gpu: { requestAdapter: () => new Promise(() => {}) } }
    expect(await checkWebGPU(nav, 10)).toEqual({ status: 'no-adapter' })
  })

  it('reports the adapter details when one is available', async () => {
    const nav: NavigatorLike = { gpu: { requestAdapter: async () => fakeAdapter(['shader-f16']) } }
    expect(await checkWebGPU(nav)).toEqual({
      status: 'available',
      shaderF16: true,
      isFallbackAdapter: false,
      maxBufferSize: 4_294_967_296,
      maxStorageBufferBindingSize: 2_147_483_648,
      vendor: 'apple',
      architecture: 'metal-3',
    })
  })

  it('flags a missing shader-f16 feature and a software fallback adapter', async () => {
    const nav: NavigatorLike = { gpu: { requestAdapter: async () => fakeAdapter([], true) } }
    const result = await checkWebGPU(nav)
    expect(result).toMatchObject({ status: 'available', shaderF16: false, isFallbackAdapter: true })
  })

  it('asks for the high-performance adapter', async () => {
    const requestAdapter = vi.fn(async () => fakeAdapter())
    await checkWebGPU({ gpu: { requestAdapter } })
    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' })
  })
})

describe('getStorageEstimate', () => {
  it('returns null when the browser has no storage API', async () => {
    expect(await getStorageEstimate({})).toBeNull()
  })

  it('returns usage, quota and the space left', async () => {
    const nav: NavigatorLike = { storage: { estimate: async () => ({ usage: 300, quota: 1000 }) } }
    expect(await getStorageEstimate(nav)).toEqual({
      usageBytes: 300,
      quotaBytes: 1000,
      availableBytes: 700,
    })
  })

  it('never reports negative space left', async () => {
    const nav: NavigatorLike = { storage: { estimate: async () => ({ usage: 1200, quota: 1000 }) } }
    expect((await getStorageEstimate(nav))?.availableBytes).toBe(0)
  })

  it('returns null when the browser gives no quota or the call fails', async () => {
    expect(await getStorageEstimate({ storage: { estimate: async () => ({ usage: 5 }) } })).toBeNull()
    expect(
      await getStorageEstimate({ storage: { estimate: () => Promise.reject(new Error('denied')) } }),
    ).toBeNull()
  })
})

describe('isStoragePersisted', () => {
  it('returns null without the API, and the state when it exists', async () => {
    expect(await isStoragePersisted({})).toBeNull()
    expect(await isStoragePersisted({ storage: { persisted: async () => false } })).toBe(false)
    expect(await isStoragePersisted({ storage: { persisted: async () => true } })).toBe(true)
  })
})

describe('requestPersistentStorage', () => {
  it('returns null when the browser cannot persist storage', async () => {
    expect(await requestPersistentStorage({})).toBeNull()
  })

  it('does not ask again when storage is already persistent', async () => {
    const persist = vi.fn(async () => true)
    const nav: NavigatorLike = { storage: { persisted: async () => true, persist } }
    expect(await requestPersistentStorage(nav)).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('returns what the browser grants', async () => {
    const granted: NavigatorLike = { storage: { persisted: async () => false, persist: async () => true } }
    const denied: NavigatorLike = { storage: { persisted: async () => false, persist: async () => false } }
    expect(await requestPersistentStorage(granted)).toBe(true)
    expect(await requestPersistentStorage(denied)).toBe(false)
  })

  it('returns false when the request fails', async () => {
    const nav: NavigatorLike = { storage: { persist: () => Promise.reject(new Error('blocked')) } }
    expect(await requestPersistentStorage(nav)).toBe(false)
  })
})

describe('checkCapabilities', () => {
  it('combines every check and reports unknowns as null', async () => {
    expect(await checkCapabilities({})).toEqual({
      webgpu: { status: 'unsupported' },
      deviceMemoryGB: null,
      logicalCores: null,
      storage: null,
      persisted: null,
      crossOriginIsolated: false,
    })
  })

  it('reads memory, cores, storage and isolation without asking to persist', async () => {
    vi.stubGlobal('crossOriginIsolated', true)
    const persist = vi.fn(async () => true)
    const nav: NavigatorLike = {
      gpu: { requestAdapter: async () => fakeAdapter(['shader-f16']) },
      deviceMemory: 4,
      hardwareConcurrency: 8,
      storage: {
        estimate: async () => ({ usage: 0, quota: 2000 }),
        persisted: async () => false,
        persist,
      },
    }
    const result = await checkCapabilities(nav)
    expect(result).toMatchObject({
      webgpu: { status: 'available', shaderF16: true },
      deviceMemoryGB: 4,
      logicalCores: 8,
      storage: { usageBytes: 0, quotaBytes: 2000, availableBytes: 2000 },
      persisted: false,
      crossOriginIsolated: true,
    })
    expect(persist).not.toHaveBeenCalled()
  })
})
