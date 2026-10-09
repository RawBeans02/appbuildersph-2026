import { describe, expect, it, vi } from 'vitest'
import { createPayload, type RawCounts } from '../../qr'
import { keepScreenOn, type WakeLockEnv } from './wakeLock'
import { reusableExport, suppressCounts, weekOf, whatLeaves } from './whatLeaves'

const RAW: RawCounts = {
  exposed: { under2m: 0, m2to12: 0, y1to5: 0, y5to17: 3, y18to59: 6, y60plus: 1 },
  inWatchWindow: 9,
  fastBreathing: { under2m: 0, m2to12: 0, y1to5: 2 },
  urgentReferrals: 0,
  doxyCapsulesOnHand: 40,
  doxyCapsulesExpiring6w: 30,
  clinicianReviewFlags: 1,
}

const exported = (seq: number, raw: RawCounts, epiWeek = '2026-W41') => ({
  payload: createPayload({ municipality: 'SID', barangay: 'SID-MAL', epiWeek, seq, counts: raw }),
})

describe('whatLeaves', () => {
  it('lists all 14 counts, suppressed, in the copy deck\'s groups and words', () => {
    expect(whatLeaves(suppressCounts(RAW))).toEqual([
      {
        heading: 'Exposed, watch not started yet, by age',
        rows: [
          { label: 'Under 2 months', value: '0' },
          { label: '2 up to 12 months', value: '0' },
          { label: '12 months up to 5 years', value: '0' },
          { label: '5 to 17 years', value: '<5' },
          { label: '18 to 59 years', value: '6' },
          { label: '60 and over', value: '<5' },
        ],
      },
      { heading: null, rows: [{ label: 'In the watch window now', value: '9' }] },
      {
        heading: 'Fast-breathing referrals, by age',
        rows: [
          { label: 'Under 2 months', value: '0' },
          { label: '2 up to 12 months', value: '0' },
          { label: '12 months up to 5 years', value: '<5' },
        ],
      },
      { heading: null, rows: [{ label: 'URGENT referrals', value: '0' }] },
      { heading: null, rows: [{ label: 'Doxycycline capsules on hand', value: '40' }] },
      { heading: null, rows: [{ label: 'Of those, expiring within 6 weeks', value: '30' }] },
      { heading: null, rows: [{ label: 'Flags for clinician review', value: '<5' }] },
    ])
  })

  it('shows exactly what the signed payload carries', () => {
    expect(whatLeaves(exported(1, RAW).payload.counts)).toEqual(whatLeaves(suppressCounts(RAW)))
  })
})

describe('reusableExport', () => {
  const counts = suppressCounts(RAW)

  it('shows the same export again while the week and the shown counts are unchanged', () => {
    const previous = exported(3, RAW)
    expect(reusableExport(previous, '2026-W41', counts)).toBe(previous)
    // 2 and 3 both show as "<5", so the QR would say the same thing.
    expect(reusableExport(previous, '2026-W41', suppressCounts({ ...RAW, clinicianReviewFlags: 3 }))).toBe(previous)
  })

  it('makes a new export when a shown count or the week changed, or none was made yet', () => {
    expect(reusableExport(exported(3, RAW), '2026-W41', suppressCounts({ ...RAW, inWatchWindow: 10 }))).toBeNull()
    expect(reusableExport(exported(3, RAW), '2026-W41', suppressCounts({ ...RAW, clinicianReviewFlags: 0 }))).toBeNull()
    expect(reusableExport(exported(3, RAW, '2026-W40'), '2026-W41', counts)).toBeNull()
    expect(reusableExport(null, '2026-W41', counts)).toBeNull()
  })
})

describe('weekOf', () => {
  it('gives the ISO week of a calendar day', () => {
    expect(weekOf('2026-10-10')).toBe('2026-W41')
    expect(weekOf('2026-10-12')).toBe('2026-W42')
  })
})

describe('keepScreenOn', () => {
  function fakeEnv() {
    const sentinels: { release: ReturnType<typeof vi.fn> }[] = []
    let visible = true
    let onChange: (() => void) | null = null
    const env: WakeLockEnv = {
      request: vi.fn(async () => {
        const sentinel = { release: vi.fn(async () => {}) }
        sentinels.push(sentinel)
        return sentinel
      }),
      isVisible: () => visible,
      onVisibilityChange(listener) {
        onChange = listener
        return () => {
          onChange = null
        }
      },
    }
    const setVisible = (value: boolean) => {
      visible = value
      onChange?.()
    }
    return { env, sentinels, setVisible, listening: () => onChange !== null }
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('holds the lock, asks again when the page comes back, and releases it on leave', async () => {
    const { env, sentinels, setVisible, listening } = fakeEnv()
    const stop = keepScreenOn(env)
    await settle()
    expect(env.request).toHaveBeenCalledTimes(1)

    setVisible(false)
    setVisible(true)
    await settle()
    expect(env.request).toHaveBeenCalledTimes(2)

    stop()
    expect(sentinels[1].release).toHaveBeenCalled()
    expect(listening()).toBe(false)
  })

  it('releases a lock that arrives after leaving', async () => {
    const { env, sentinels } = fakeEnv()
    const stop = keepScreenOn(env)
    stop()
    await settle()
    expect(sentinels[0].release).toHaveBeenCalled()
  })

  it('does nothing, without an error, where the API is missing or refuses', async () => {
    const missing = keepScreenOn({ request: null, isVisible: () => true, onVisibilityChange: () => () => {} })
    expect(missing).not.toThrow()

    const refusing = keepScreenOn({
      request: () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
      isVisible: () => true,
      onVisibilityChange: () => () => {},
    })
    await settle()
    expect(refusing).not.toThrow()
  })
})
