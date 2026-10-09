import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { createAppShell, type ShellStatus } from './pwa'

export const appShell = createAppShell()

export function startServiceWorker() {
  // The service worker only exists in production builds (devOptions is off).
  const supported = import.meta.env.PROD && 'serviceWorker' in navigator
  appShell.start({
    register: registerSW,
    supported,
    reload: () => window.location.reload(),
    ready: supported ? navigator.serviceWorker.ready : new Promise(() => {}),
  })
}

export function useShellStatus(): ShellStatus {
  return useSyncExternalStore(appShell.subscribe, appShell.getStatus, appShell.getStatus)
}
