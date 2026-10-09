import { afterEach, describe, expect, it, vi } from 'vitest'
import { prebuiltAppConfig } from '@mlc-ai/web-llm'
import { wordingModelCached } from './laptopAi'
import { WORDING_MODEL, WORDING_MODEL_RECORDS } from './llm/model'
import { WORDING_WORKER_CACHE_NAME, WORDING_WORKER_URL } from './llm/workerAsset'

type CacheEntries = Record<string, Record<string, string>>

// A Cache API stand-in: cache name → URL → body.
function fakeCaches(entries: CacheEntries) {
  return {
    has: async (name: string) => name in entries,
    open: async (name: string) =>
      ({
        match: async (url: string) => (entries[name]?.[url] !== undefined ? new Response(entries[name][url]) : undefined),
      }) as unknown as Cache,
  }
}

function completeCache(shaderF16: boolean): CacheEntries {
  const record = shaderF16 ? WORDING_MODEL_RECORDS.f16 : WORDING_MODEL_RECORDS.f32
  const base = `${record.model}/resolve/main/`
  return {
    'webllm/config': {
      [`${base}mlc-chat-config.json`]: JSON.stringify({ tokenizer_files: ['tokenizer.json'] }),
    },
    'webllm/wasm': { [record.model_lib]: 'wasm' },
    'webllm/model': {
      [`${base}tokenizer.json`]: 'tokenizer',
      [`${base}tensor-cache.json`]: JSON.stringify({ records: [{ dataPath: 'params_shard_0.bin' }] }),
      [`${base}params_shard_0.bin`]: 'weights',
    },
    [WORDING_WORKER_CACHE_NAME]: { [WORDING_WORKER_URL]: 'worker' },
  }
}

function fakeNavigator(shaderF16: boolean) {
  return {
    gpu: {
      requestAdapter: async () => ({
        features: { has: (feature: string) => feature === 'shader-f16' && shaderF16 },
        limits: { maxBufferSize: 1, maxStorageBufferBindingSize: 1 },
        info: { vendor: 'test', architecture: 'test', isFallbackAdapter: false },
      }),
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('wordingModelCached', () => {
  it('uses the exact f16 or f32 prebuilt record selected by the adapter', async () => {
    expect(WORDING_MODEL_RECORDS.f16).toEqual(
      prebuiltAppConfig.model_list.find((record) => record.model_id === WORDING_MODEL.f16),
    )
    expect(WORDING_MODEL_RECORDS.f32).toEqual(
      prebuiltAppConfig.model_list.find((record) => record.model_id === WORDING_MODEL.f32),
    )

    expect(await wordingModelCached(fakeCaches(completeCache(true)), true)).toBe(true)
    expect(await wordingModelCached(fakeCaches(completeCache(false)), false)).toBe(true)
    expect(await wordingModelCached(fakeCaches(completeCache(true)), false)).toBe(false)
    expect(await wordingModelCached(fakeCaches(completeCache(false)), true)).toBe(false)
  })

  it('requires each config, tokenizer, model library, tensor, and worker artifact', async () => {
    const full = completeCache(true)
    expect(await wordingModelCached(fakeCaches(full), true)).toBe(true)

    const missing: [string, string][] = [
      ['webllm/config', `${WORDING_MODEL_RECORDS.f16.model}/resolve/main/mlc-chat-config.json`],
      ['webllm/model', `${WORDING_MODEL_RECORDS.f16.model}/resolve/main/tokenizer.json`],
      ['webllm/wasm', WORDING_MODEL_RECORDS.f16.model_lib],
      ['webllm/model', `${WORDING_MODEL_RECORDS.f16.model}/resolve/main/tensor-cache.json`],
      ['webllm/model', `${WORDING_MODEL_RECORDS.f16.model}/resolve/main/params_shard_0.bin`],
      [WORDING_WORKER_CACHE_NAME, WORDING_WORKER_URL],
    ]
    for (const [cacheName, url] of missing) {
      const entries = structuredClone(full)
      delete entries[cacheName][url]
      expect(await wordingModelCached(fakeCaches(entries), true), `${cacheName}: ${url}`).toBe(false)
    }
  })

  it('uses tokenizer.model when that is what the cached chat config declares', async () => {
    const entries = completeCache(false)
    const base = `${WORDING_MODEL_RECORDS.f32.model}/resolve/main/`
    entries['webllm/config'][`${base}mlc-chat-config.json`] = JSON.stringify({ tokenizer_files: ['tokenizer.model'] })
    entries['webllm/model'][`${base}tokenizer.model`] = 'tokenizer'
    delete entries['webllm/model'][`${base}tokenizer.json`]
    expect(await wordingModelCached(fakeCaches(entries), false)).toBe(true)
  })

  it('uses the adapter-selected variant when the caller does not pass one', async () => {
    vi.stubGlobal('navigator', fakeNavigator(false))
    expect(await wordingModelCached(fakeCaches(completeCache(false)))).toBe(true)
    expect(await wordingModelCached(fakeCaches(completeCache(true)))).toBe(false)
  })

  it('is false with no cache API, a corrupt index or an unsupported config', async () => {
    expect(await wordingModelCached(undefined, true)).toBe(false)
    expect(await wordingModelCached(fakeCaches({}), true)).toBe(false)

    const badIndex = completeCache(true)
    badIndex['webllm/model'][`${WORDING_MODEL_RECORDS.f16.model}/resolve/main/tensor-cache.json`] = 'not json'
    expect(await wordingModelCached(fakeCaches(badIndex), true)).toBe(false)

    const badConfig = completeCache(true)
    badConfig['webllm/config'][`${WORDING_MODEL_RECORDS.f16.model}/resolve/main/mlc-chat-config.json`] = JSON.stringify({ tokenizer_files: ['vocab.json'] })
    expect(await wordingModelCached(fakeCaches(badConfig), true)).toBe(false)
  })
})
