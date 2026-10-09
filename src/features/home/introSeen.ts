import { useSyncExternalStore } from 'react'
import { navigate, normalizePath } from '../../app/router'
import { INTRO_SEEN_KEY } from './introKey'

// When the first-run intro (design pass 2, A1: 0a–0c) shows over Home, and
// the per-phone "intro seen" flag. Its own small module, so Home only mounts
// the intro's chunk when this says so.

type Where = { pathname: string; search: string }
type FlagStore = Pick<Storage, 'getItem' | 'setItem'>

// "/?intro" reopens it (Home's "How it works", Privacy & AI's L10b).
export function introRequested(search: string): boolean {
  return new URLSearchParams(search).has('intro')
}

// Only Home ("/") ever shows it. A deep link (/watch, /hinga, /stock, /send,
// /receive) and every /municipal screen never do, so shared links and the
// laptop skip it, even with ?intro.
export function shouldShowIntro(where: Where, seen: boolean): boolean {
  if (normalizePath(where.pathname) !== '/') return false
  return !seen || introRequested(where.search)
}

// The flag lives in the first store that works: localStorage, then
// sessionStorage. Either can be missing or throw (private mode, blocked site
// data); with both blocked, it holds for this page only, so the intro shows
// once per session.
export function createSeenFlag(stores: () => (FlagStore | null)[]) {
  let seenThisPage = false
  return {
    seen(): boolean {
      if (seenThisPage) return true
      for (const store of stores()) {
        try {
          if (store?.getItem(INTRO_SEEN_KEY) === '1') return true
        } catch {
          // Blocked: try the next store.
        }
      }
      return false
    },
    markSeen(): void {
      seenThisPage = true
      for (const store of stores()) {
        if (!store) continue
        try {
          store.setItem(INTRO_SEEN_KEY, '1')
          return
        } catch {
          // Blocked or full: try the next store.
        }
      }
    },
  }
}

// Reading window.localStorage itself throws when site data is blocked.
function browserStore(name: 'localStorage' | 'sessionStorage'): FlagStore | null {
  try {
    return window[name]
  } catch {
    return null
  }
}

const flag = createSeenFlag(() => [browserStore('localStorage'), browserStore('sessionStorage')])

// The router only tells its listeners when the path changes, and a link to
// "/?intro" from Home keeps the path. So the answer is checked again after
// every click (once the link's own handler has navigated) and every history
// step, and when the intro closes.
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    document.addEventListener('click', notify)
    window.addEventListener('popstate', notify)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      document.removeEventListener('click', notify)
      window.removeEventListener('popstate', notify)
    }
  }
}

const snapshot = () => shouldShowIntro(window.location, flag.seen())

export function useShowIntro(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

// Skip, Escape, "Start · Simulan" and a tap on a 0b row: the intro is seen.
// "?intro" leaves the address, so a reload or the back button doesn't
// reopen it.
export function closeIntro() {
  flag.markSeen()
  if (introRequested(window.location.search)) navigate('/', { replace: true })
  notify()
}
