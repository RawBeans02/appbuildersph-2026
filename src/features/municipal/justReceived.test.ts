import { describe, expect, it } from 'vitest'
import { firstShowing, newestScanned, noteScanned, scannedThisSession } from './justReceived'

function memory() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) }
}

describe('justReceived', () => {
  it('marks only the newest QR scanned in this session, never the pre-made ones', () => {
    const storage = memory()
    const received = [
      { id: 'SID-BGS:2026-W41:3', receivedAt: '2026-10-10T00:10:00.000Z' },
      { id: 'SID-MAL:2026-W41:4', receivedAt: '2026-10-10T00:05:00.000Z' },
      { id: 'SID-RIV:2026-W41:2', receivedAt: '2026-10-10T00:20:00.000Z' },
    ]
    expect(newestScanned(received, storage)).toBeNull()
    noteScanned('SID-MAL:2026-W41:4', storage)
    noteScanned('SID-MAL:2026-W41:4', storage)
    expect(scannedThisSession(storage)).toEqual(['SID-MAL:2026-W41:4'])
    expect(newestScanned(received, storage)?.id).toBe('SID-MAL:2026-W41:4')
  })
  it('plays the arrival once per QR', () => {
    const storage = memory()
    expect(firstShowing('a', storage)).toBe(true)
    expect(firstShowing('a', storage)).toBe(false)
    expect(firstShowing('b', storage)).toBe(true)
  })
  it('does nothing when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(() => noteScanned('a', blocked)).not.toThrow()
    expect(scannedThisSession(blocked)).toEqual([])
    expect(firstShowing('a', blocked)).toBe(false)
  })
})
