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
  // navigator.serviceWorker.ready: resolves once this scope has an active worker.
  ready: Promise<unknown>
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
      // workbox-window only follows workers that start installing after
      // register(), so a reload in the middle of the first install would never
      // see onOfflineReady. An active worker means the precache install succeeded.
      void options.ready.then(() => setStatus('ready'))
      options.register({
        immediate: true,
        // First install finished: the whole shell is precached.
        onOfflineReady: () => setStatus('ready'),
        onRegisteredSW: (_url, registration) => {
          // Returning visit: an active worker means the shell was cached before.
          if (registration?.active) setStatus('ready')
          // A failed precache install (a network blip, a missing file) makes the
          // worker redundant, which workbox-window doesn't report.
          const installing = registration?.installing
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'redundant' && status !== 'ready') setStatus('error')
          })
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
    // Load lazy chunks (the inference worker, the runtime) before holding: once
    // a new version is active, the old version's chunks can be gone.
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
