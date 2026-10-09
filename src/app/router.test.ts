import { describe, expect, it, vi } from 'vitest'
import { createNavigation, normalizePath } from './router'

function fakeWindow(start = '/') {
  const target = new EventTarget()
  const win = {
    location: { pathname: start },
    history: {
      pushState: vi.fn((_state: unknown, _title: string, url?: string | URL | null) => {
        win.location.pathname = String(url)
      }),
      replaceState: vi.fn((_state: unknown, _title: string, url?: string | URL | null) => {
        win.location.pathname = String(url)
      }),
    },
    scrollTo: vi.fn(),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    back(to: string) {
      win.location.pathname = to
      target.dispatchEvent(new Event('popstate'))
    },
  }
  return win
}

describe('normalizePath', () => {
  it('drops the trailing slash, the query and the hash', () => {
    expect(normalizePath('/watch/')).toBe('/watch')
    expect(normalizePath('/municipal/plan?x=1#top')).toBe('/municipal/plan')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
    expect(normalizePath('///')).toBe('/')
  })
})

describe('createNavigation', () => {
  it('pushes a path, scrolls to the top and tells subscribers', () => {
    const win = fakeWindow()
    const navigation = createNavigation(win as never)
    const listener = vi.fn()
    navigation.subscribe(listener)

    navigation.navigate('/stock/')
    expect(win.history.pushState).toHaveBeenCalledWith(null, '', '/stock/')
    expect(navigation.getPath()).toBe('/stock')
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0)
    expect(listener).toHaveBeenCalledOnce()

    navigation.navigate('/send', { replace: true })
    expect(win.history.replaceState).toHaveBeenCalledWith(null, '', '/send')
  })

  it('follows the back and forward buttons until unsubscribed', () => {
    const win = fakeWindow('/watch')
    const navigation = createNavigation(win as never)
    const listener = vi.fn()
    const unsubscribe = navigation.subscribe(listener)

    win.back('/')
    expect(listener).toHaveBeenCalledOnce()
    expect(navigation.getPath()).toBe('/')

    unsubscribe()
    win.back('/watch')
    expect(listener).toHaveBeenCalledOnce()
  })
})
