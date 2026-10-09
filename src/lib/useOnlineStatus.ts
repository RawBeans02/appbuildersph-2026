import { useSyncExternalStore } from 'react'

// navigator.onLine === false reliably means offline. true only means a network
// is connected, not that the internet is reachable, so cloud features must
// still handle failed requests.

export function subscribeToOnlineStatus(
  onChange: () => void,
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  target.addEventListener('online', onChange)
  target.addEventListener('offline', onChange)
  return () => {
    target.removeEventListener('online', onChange)
    target.removeEventListener('offline', onChange)
  }
}

export function getOnlineStatus(): boolean {
  return navigator.onLine
}

// Server snapshot: assume online until the browser says otherwise.
const getServerOnlineStatus = () => true

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeToOnlineStatus, getOnlineStatus, getServerOnlineStatus)
}
