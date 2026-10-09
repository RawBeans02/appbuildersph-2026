import { describe, expect, it } from 'vitest'
import { INTRO_SEEN_KEY } from './introKey'
import { createSeenFlag, introRequested, shouldShowIntro } from './introSeen'

function memoryStore() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

// What a browser with blocked site data hands back: every call throws.
function blockedStore() {
  const blocked = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  return { getItem: blocked, setItem: blocked }
}

const at = (url: string) => {
  const { pathname, search } = new URL(url, 'https://agapay.example')
  return { pathname, search }
}

describe('shouldShowIntro', () => {
  it('shows on Home the first time, and not once it is seen', () => {
    expect(shouldShowIntro(at('/'), false)).toBe(true)
    expect(shouldShowIntro(at('/'), true)).toBe(false)
  })

  it('reopens on Home with ?intro, seen or not', () => {
    expect(shouldShowIntro(at('/?intro'), true)).toBe(true)
    expect(shouldShowIntro(at('/?intro=1'), true)).toBe(true)
    expect(shouldShowIntro(at('/?x=2&intro'), true)).toBe(true)
    expect(shouldShowIntro(at('/?intro'), false)).toBe(true)
  })

  it('ignores other parameters on Home', () => {
    expect(shouldShowIntro(at('/?introduction=1'), true)).toBe(false)
    expect(shouldShowIntro(at('/#intro'), true)).toBe(false)
  })

  it('never shows on a deep link, even the first time or with ?intro', () => {
    for (const path of ['/watch', '/watch?step=log', '/hinga', '/stock', '/send', '/receive', '/privacy', '/prepare', '/no-such-page']) {
      expect(shouldShowIntro(at(path), false), path).toBe(false)
      expect(shouldShowIntro(at(`${path}${path.includes('?') ? '&' : '?'}intro`), false), `${path} with ?intro`).toBe(false)
    }
  })

  it('never shows on the municipal laptop', () => {
    for (const path of ['/municipal', '/municipal/', '/municipal/merged', '/municipal/plan', '/municipal/log']) {
      expect(shouldShowIntro(at(path), false), path).toBe(false)
      expect(shouldShowIntro(at(`${path}?intro`), false), `${path}?intro`).toBe(false)
    }
  })

  it('treats a trailing slash or an empty path as Home', () => {
    expect(shouldShowIntro({ pathname: '', search: '' }, false)).toBe(true)
    expect(shouldShowIntro({ pathname: '//', search: '?intro' }, true)).toBe(true)
  })
})

describe('introRequested', () => {
  it('reads the intro parameter only', () => {
    expect(introRequested('?intro')).toBe(true)
    expect(introRequested('')).toBe(false)
    expect(introRequested('?step=log')).toBe(false)
  })
})

describe('createSeenFlag', () => {
  it('starts unseen, and remembers in localStorage', () => {
    const local = memoryStore()
    const session = memoryStore()
    const flag = createSeenFlag(() => [local, session])
    expect(flag.seen()).toBe(false)
    flag.markSeen()
    expect(flag.seen()).toBe(true)
    expect(local.data.get(INTRO_SEEN_KEY)).toBe('1')
    expect(session.data.size).toBe(0)
    // The next page load (a new flag) still knows.
    expect(createSeenFlag(() => [local, session]).seen()).toBe(true)
  })

  it('counts a flag already in either store', () => {
    const local = memoryStore()
    const session = memoryStore()
    session.data.set(INTRO_SEEN_KEY, '1')
    expect(createSeenFlag(() => [local, session]).seen()).toBe(true)
    expect(createSeenFlag(() => [memoryStore(), memoryStore()]).seen()).toBe(false)
  })

  it('ignores any other value under the key', () => {
    const local = memoryStore()
    local.data.set(INTRO_SEEN_KEY, 'no')
    expect(createSeenFlag(() => [local, null]).seen()).toBe(false)
  })

  it('falls back to sessionStorage when localStorage throws', () => {
    const session = memoryStore()
    const flag = createSeenFlag(() => [blockedStore(), session])
    expect(flag.seen()).toBe(false)
    flag.markSeen()
    expect(session.data.get(INTRO_SEEN_KEY)).toBe('1')
    expect(createSeenFlag(() => [blockedStore(), session]).seen()).toBe(true)
  })

  it('falls back to sessionStorage when localStorage is missing', () => {
    const session = memoryStore()
    createSeenFlag(() => [null, session]).markSeen()
    expect(session.data.get(INTRO_SEEN_KEY)).toBe('1')
  })

  it('with both stores blocked, holds for this page only: the intro shows once per session', () => {
    const flag = createSeenFlag(() => [blockedStore(), blockedStore()])
    expect(flag.seen()).toBe(false)
    expect(() => flag.markSeen()).not.toThrow()
    expect(flag.seen()).toBe(true)
    // A reload starts a new page: unseen again.
    expect(createSeenFlag(() => [blockedStore(), blockedStore()]).seen()).toBe(false)
  })

  it('with no stores at all, holds for this page only', () => {
    const flag = createSeenFlag(() => [null, null])
    flag.markSeen()
    expect(flag.seen()).toBe(true)
  })
})
