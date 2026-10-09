import { useSyncExternalStore } from 'react'

// A minimal History API router: the app has a handful of fixed paths, so no
// router library. Paths are matched exactly, ignoring a trailing slash.

export function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/)[0] || '/'
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : '/'
}

type HistoryWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'scrollTo'> & {
  history: Pick<History, 'pushState' | 'replaceState'>
  location: Pick<Location, 'pathname'>
}

export function createNavigation(win: HistoryWindow) {
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  return {
    getPath: () => normalizePath(win.location.pathname),
    subscribe(listener: () => void) {
      if (listeners.size === 0) win.addEventListener('popstate', notify)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) win.removeEventListener('popstate', notify)
      }
    },
    navigate(to: string, options: { replace?: boolean } = {}) {
      if (options.replace) win.history.replaceState(null, '', to)
      else win.history.pushState(null, '', to)
      win.scrollTo(0, 0)
      notify()
    },
  }
}

export type Navigation = ReturnType<typeof createNavigation>

let browserNavigation: Navigation | null = null
function getBrowserNavigation() {
  browserNavigation ??= createNavigation(window)
  return browserNavigation
}

export function navigate(to: string, options?: { replace?: boolean }) {
  getBrowserNavigation().navigate(to, options)
}

export function usePath(): string {
  const navigation = getBrowserNavigation()
  return useSyncExternalStore(navigation.subscribe, navigation.getPath, () => '/')
}
