import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOnlineStatus, subscribeToOnlineStatus } from './useOnlineStatus'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('subscribeToOnlineStatus', () => {
  it('calls back on online and offline events until unsubscribed', () => {
    const target = new EventTarget()
    const onChange = vi.fn()
    const unsubscribe = subscribeToOnlineStatus(onChange, target)

    target.dispatchEvent(new Event('offline'))
    target.dispatchEvent(new Event('online'))
    expect(onChange).toHaveBeenCalledTimes(2)

    unsubscribe()
    target.dispatchEvent(new Event('offline'))
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})

describe('getOnlineStatus', () => {
  it('reflects navigator.onLine', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(getOnlineStatus()).toBe(false)
    vi.stubGlobal('navigator', { onLine: true })
    expect(getOnlineStatus()).toBe(true)
  })
})
