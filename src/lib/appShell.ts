import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { createAppShell, type ShellStatus } from './pwa'

export const appShell = createAppShell()

export function startServiceWorker() {
  appShell.start({
    register: registerSW,
    // The service worker only exists in production builds (devOptions is off).
    supported: import.meta.env.PROD && 'serviceWorker' in navigator,
    reload: () => window.location.reload(),
  })
}

export function useShellStatus(): ShellStatus {
  return useSyncExternalStore(appShell.subscribe, appShell.getStatus, appShell.getStatus)
}
