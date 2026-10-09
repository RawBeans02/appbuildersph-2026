import { describe, expect, it } from 'vitest'
import type { NavigatorLike } from './capabilities'
import { prepareStorageForDownload } from './storage'

function fakeStorage(options: { quota: number; usage: number; grant: boolean; calls?: string[] }) {
  const calls = options.calls ?? []
  const nav: NavigatorLike = {
    storage: {
      persisted: async () => {
        calls.push('persisted')
        return false
      },
      persist: async () => {
        calls.push('persist')
        return options.grant
      },
      estimate: async () => {
        calls.push('estimate')
        return { quota: options.quota, usage: options.usage }
      },
    },
  }
  return nav
}

describe('prepareStorageForDownload', () => {
  it('asks for persistence, then reports the space left and that the download fits', async () => {
    const calls: string[] = []
    const nav = fakeStorage({ quota: 5000, usage: 1000, grant: true, calls })
    expect(await prepareStorageForDownload(1000, nav)).toEqual({
      requiredBytes: 1000,
      availableBytes: 4000,
      fits: true,
      persisted: true,
    })
    expect(calls).toEqual(['persisted', 'persist', 'estimate'])
  })

  it('needs 10% headroom over the download size', async () => {
    const tight = fakeStorage({ quota: 1050, usage: 0, grant: true })
    const enough = fakeStorage({ quota: 1100, usage: 0, grant: true })
    expect((await prepareStorageForDownload(1000, tight)).fits).toBe(false)
    expect((await prepareStorageForDownload(1000, enough)).fits).toBe(true)
  })

  it('still checks space when persistence is denied', async () => {
    const nav = fakeStorage({ quota: 5000, usage: 0, grant: false })
    expect(await prepareStorageForDownload(1000, nav)).toMatchObject({ fits: true, persisted: false })
  })

  it('does not wait more than the limit for an unanswered permission prompt', async () => {
    const nav: NavigatorLike = {
      storage: {
        persisted: async () => false,
        persist: () => new Promise(() => {}),
        estimate: async () => ({ quota: 5000, usage: 0 }),
      },
    }
    expect(await prepareStorageForDownload(1000, nav, 10)).toEqual({
      requiredBytes: 1000,
      availableBytes: 5000,
      fits: true,
      persisted: null,
    })
  })

  it('reports unknowns as null when the browser has no storage APIs', async () => {
    expect(await prepareStorageForDownload(1000, {})).toEqual({
      requiredBytes: 1000,
      availableBytes: null,
      fits: null,
      persisted: null,
    })
  })

  it('rejects a negative or non-numeric size', async () => {
    await expect(prepareStorageForDownload(-1, {})).rejects.toThrow(RangeError)
    await expect(prepareStorageForDownload(Number.NaN, {})).rejects.toThrow(RangeError)
  })
})
