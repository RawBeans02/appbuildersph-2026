import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { createAppShell, type ShellStatus } from './pwa'

export const appShell = createAppShell()

// Mirrored on <html data-shell-status> for the e2e test, independent of page copy.
function mirrorStatus() {
  document.documentElement.dataset.shellStatus = appShell.getStatus()
}
appShell.subscribe(mirrorStatus)

export function startServiceWorker() {
  // The service worker only exists in production builds (devOptions is off).
  const supported = import.meta.env.PROD && 'serviceWorker' in navigator
  appShell.start({
    register: registerSW,
    supported,
    reload: () => window.location.reload(),
    ready: supported ? navigator.serviceWorker.ready : new Promise(() => {}),
  })
  mirrorStatus()
}

export function useShellStatus(): ShellStatus {
  return useSyncExternalStore(appShell.subscribe, appShell.getStatus, appShell.getStatus)
}
