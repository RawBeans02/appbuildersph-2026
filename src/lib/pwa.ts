import type { RegisterSWOptions } from 'vite-plugin-pwa/types'

// Tracks whether the app shell (HTML, JS, CSS) is cached by the service worker,
// i.e. whether the app opens with no network. Wired up in src/lib/appShell.ts.

export type ShellStatus =
  // No service worker here (dev server, an old browser, some private modes):
  // every load needs the network.
  | 'unavailable'
  // First visit: the service worker is caching the app shell.
  | 'installing'
  // The app shell opens offline.
  | 'ready'
  // Registration failed: every load needs the network.
  | 'error'

export type ShellStartOptions = {
  register: (options: RegisterSWOptions) => unknown
  supported: boolean
  reload: () => void
}

export function createAppShell() {
  let status: ShellStatus = 'installing'
  const listeners = new Set<() => void>()
  let reload = () => {}
  let holds = 0
  let reloadPending = false

  function setStatus(next: ShellStatus) {
    if (next === status) return
    status = next
    listeners.forEach((listener) => listener())
  }

  return {
    getStatus: () => status,

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    start(options: ShellStartOptions) {
      if (!options.supported) {
        setStatus('unavailable')
        return
      }
      reload = options.reload
      options.register({
        immediate: true,
        // First install finished: the whole shell is precached.
        onOfflineReady: () => setStatus('ready'),
        // Returning visit: an active worker means the shell was cached before.
        onRegisteredSW: (_url, registration) => {
          if (registration?.active) setStatus('ready')
        },
        onRegisterError: () => {
          if (status !== 'ready') setStatus('error')
        },
        // A new deploy took over. Reload to pick it up, unless something holds the reload.
        onNeedReload: () => {
          if (holds === 0) reload()
          else reloadPending = true
        },
      })
    },

    // Call while a reload would lose work (a model download, unsaved input).
    // A new version then reloads the page only after every hold is released.
    holdReload(): () => void {
      holds += 1
      let released = false
      return () => {
        if (released) return
        released = true
        holds -= 1
        if (holds === 0 && reloadPending) {
          reloadPending = false
          reload()
        }
      }
    },
  }
}

export type AppShell = ReturnType<typeof createAppShell>
