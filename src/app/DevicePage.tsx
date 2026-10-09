import { useEffect, useState } from 'react'
import {
  checkCapabilities,
  requestPersistentStorage,
  type DeviceCapabilities,
  type WebGPUSupport,
} from '../lib/capabilities'
import { useShellStatus } from '../lib/appShell'
import { detectPlatform, pickBackend, type Backend } from '../lib/backend'
import type { ShellStatus } from '../lib/pwa'
import { useOnlineStatus } from '../lib/useOnlineStatus'

// /device: a plain developer page, not part of the designed app and not in the
// nav. It lists what this device supports, so we can check phones and laptops
// on the live URL.

function formatBytes(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}

function describeWebGPU(webgpu: WebGPUSupport): string {
  switch (webgpu.status) {
    case 'unsupported':
      return 'Not supported in this browser'
    case 'no-adapter':
      return 'Supported, but no usable GPU'
    case 'available':
      return [
        `Available (${[webgpu.vendor, webgpu.architecture].filter(Boolean).join(' ') || 'unknown GPU'})`,
        `shader-f16 ${webgpu.shaderF16 ? 'yes' : 'no'}`,
        `max buffer ${formatBytes(webgpu.maxBufferSize)}`,
        webgpu.isFallbackAdapter ? 'software fallback' : '',
      ]
        .filter(Boolean)
        .join(', ')
  }
}

const shellStatusText: Record<ShellStatus, string> = {
  unavailable: 'Not available here (needs the network on every load)',
  installing: 'Saving for offline use…',
  ready: 'Ready, opens offline',
  error: 'Could not save for offline use',
}

function describeBackend(backend: Backend): string {
  switch (backend.kind) {
    case 'webgpu':
      return `WebGPU${backend.f16 ? ' (f16)' : ' (f32 only)'}. Why: ${backend.reason}.`
    case 'wasm':
      return `WASM, ${backend.threads === 1 ? 'single-threaded' : `${backend.threads} threads`}. Why: ${backend.reason}. ${backend.threadsReason}.`
    case 'none':
      return `None. Why: ${backend.reason}.`
  }
}

function describePersisted(persisted: boolean | null): string {
  if (persisted === null) return 'Not supported'
  return persisted ? 'Yes' : 'No'
}

export default function DevicePage() {
  const online = useOnlineStatus()
  const shellStatus = useShellStatus()
  const [caps, setCaps] = useState<DeviceCapabilities | null>(null)

  useEffect(() => {
    let cancelled = false
    checkCapabilities().then((result) => {
      if (!cancelled) setCaps(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function askForPersistentStorage() {
    const persisted = await requestPersistentStorage()
    setCaps((current) => current && { ...current, persisted })
  }

  return (
    <>
      <h1>Device check</h1>
      <p>Network: {online ? 'Online' : 'Offline'}</p>
      <p>Offline app shell: {shellStatusText[shellStatus]}</p>

      <h2>Device check</h2>
      {caps === null ? (
        <p>Checking this device…</p>
      ) : (
        <dl>
          <dt>Inference backend the app would pick</dt>
          <dd>{describeBackend(pickBackend(caps, detectPlatform()))}</dd>
          <dt>WebGPU</dt>
          <dd>{describeWebGPU(caps.webgpu)}</dd>
          <dt>Device memory</dt>
          <dd>{caps.deviceMemoryGB === null ? 'Not reported' : `${caps.deviceMemoryGB} GB (browser-rounded)`}</dd>
          <dt>CPU threads</dt>
          <dd>{caps.logicalCores ?? 'Not reported'}</dd>
          <dt>Storage</dt>
          <dd>
            {caps.storage === null
              ? 'Not reported'
              : `${formatBytes(caps.storage.usageBytes)} used of ${formatBytes(caps.storage.quotaBytes)} quota`}
          </dd>
          <dt>Persistent storage</dt>
          <dd>
            {describePersisted(caps.persisted)}{' '}
            {caps.persisted === false && (
              <button type="button" onClick={askForPersistentStorage}>
                Request
              </button>
            )}
          </dd>
          <dt>Cross-origin isolated</dt>
          <dd>{caps.crossOriginIsolated ? 'Yes' : 'No'}</dd>
        </dl>
      )}
    </>
  )
}
