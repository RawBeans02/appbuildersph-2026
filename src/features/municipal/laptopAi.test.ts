import { describe, expect, it } from 'vitest'
import { wordingModelCached } from './laptopAi'
import { WORDING_MODEL } from './llm/model'

// A Cache API stand-in: cache name → URL → body.
function fakeCaches(entries: Record<string, Record<string, string>>) {
  return {
    has: async (name: string) => name in entries,
    open: async (name: string) =>
      ({
        match: async (url: string) => (entries[name]?.[url] !== undefined ? new Response(entries[name][url]) : undefined),
      }) as unknown as Cache,
  }
}

const base = `https://huggingface.co/mlc-ai/${WORDING_MODEL.f16}/resolve/main/`
const index = JSON.stringify({ records: [{ dataPath: 'params_shard_0.bin' }, { dataPath: 'params_shard_1.bin' }] })

describe('wordingModelCached', () => {
  it('is true only when the model index and every file it lists are cached', async () => {
    const full = {
      'webllm/model': {
        [`${base}tensor-cache.json`]: index,
        [`${base}params_shard_0.bin`]: 'x',
        [`${base}params_shard_1.bin`]: 'x',
      },
    }
    expect(await wordingModelCached(fakeCaches(full))).toBe(true)

    const partial = { 'webllm/model': { [`${base}tensor-cache.json`]: index, [`${base}params_shard_0.bin`]: 'x' } }
    expect(await wordingModelCached(fakeCaches(partial))).toBe(false)
  })

  it('is false with no cache, no index, a broken index, or no Cache API', async () => {
    expect(await wordingModelCached(fakeCaches({}))).toBe(false)
    expect(await wordingModelCached(fakeCaches({ 'webllm/model': {} }))).toBe(false)
    expect(await wordingModelCached(fakeCaches({ 'webllm/model': { [`${base}tensor-cache.json`]: 'not json' } }))).toBe(false)
    expect(await wordingModelCached(undefined)).toBe(false)
  })
})
