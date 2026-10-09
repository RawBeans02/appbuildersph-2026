// What this device can do, checked before any on-device model loads.
// Every check degrades to false or null ("unknown") instead of throwing, so a
// missing browser API never blanks the page or freezes the tab.

type AdapterLike = {
  features: { has(feature: string): boolean }
  limits: { maxBufferSize: number; maxStorageBufferBindingSize: number }
  info?: { vendor: string; architecture: string; isFallbackAdapter?: boolean }
}

// The parts of `navigator` we read. The real `navigator` satisfies it; tests pass fakes.
export type NavigatorLike = {
  gpu?: { requestAdapter(options?: GPURequestAdapterOptions): Promise<AdapterLike | null> }
  deviceMemory?: number
  hardwareConcurrency?: number
  storage?: {
    estimate?(): Promise<{ usage?: number; quota?: number }>
    persisted?(): Promise<boolean>
    persist?(): Promise<boolean>
  }
}

export type WebGPUSupport =
  // No WebGPU API in this browser.
  | { status: 'unsupported' }
  // The API exists but no usable GPU (blocklisted driver, disabled, or the request hung).
  | { status: 'no-adapter' }
  | {
      status: 'available'
      // Needed by f16-quantized model builds; without it, pick an f32 build.
      shaderF16: boolean
      // A software adapter (no real GPU) works but is too slow for most models.
      isFallbackAdapter: boolean
      maxBufferSize: number
      maxStorageBufferBindingSize: number
      vendor: string
      architecture: string
    }

export type StorageInfo = {
  usageBytes: number
  quotaBytes: number
  availableBytes: number
}

export type DeviceCapabilities = {
  webgpu: WebGPUSupport
  // RAM in GB, Chromium only. The browser rounds and caps it, so it is coarse.
  deviceMemoryGB: number | null
  logicalCores: number | null
  storage: StorageInfo | null
  // Whether storage is already persistent (eviction-proof). null: no API.
  persisted: boolean | null
  // Needed for SharedArrayBuffer, which threaded WASM runtimes use.
  crossOriginIsolated: boolean
}

export const ADAPTER_TIMEOUT_MS = 5000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function checkWebGPU(
  nav: NavigatorLike = navigator,
  timeoutMs = ADAPTER_TIMEOUT_MS,
): Promise<WebGPUSupport> {
  if (!nav.gpu) return { status: 'unsupported' }
  let adapter: AdapterLike | null
  try {
    adapter = await withTimeout(
      nav.gpu.requestAdapter({ powerPreference: 'high-performance' }),
      timeoutMs,
    )
  } catch {
    return { status: 'no-adapter' }
  }
  if (!adapter) return { status: 'no-adapter' }
  return {
    status: 'available',
    shaderF16: adapter.features.has('shader-f16'),
    isFallbackAdapter: adapter.info?.isFallbackAdapter === true,
    maxBufferSize: adapter.limits.maxBufferSize,
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    vendor: adapter.info?.vendor ?? '',
    architecture: adapter.info?.architecture ?? '',
  }
}

export async function getStorageEstimate(
  nav: NavigatorLike = navigator,
): Promise<StorageInfo | null> {
  if (!nav.storage?.estimate) return null
  try {
    const { usage = 0, quota } = await nav.storage.estimate()
    if (quota === undefined) return null
    return {
      usageBytes: usage,
      quotaBytes: quota,
      availableBytes: Math.max(0, quota - usage),
    }
  } catch {
    return null
  }
}

// Reads the persistence state without asking for it (asking can show a prompt).
export async function isStoragePersisted(nav: NavigatorLike = navigator): Promise<boolean | null> {
  if (!nav.storage?.persisted) return null
  try {
    return await nav.storage.persisted()
  } catch {
    return null
  }
}

// Asks the browser not to evict our storage (cached model weights, user data).
// Some browsers show a prompt, so call it from a user action such as starting a
// model download. Returns null when the browser has no persistence API.
export async function requestPersistentStorage(
  nav: NavigatorLike = navigator,
): Promise<boolean | null> {
  if (!nav.storage?.persist) return null
  try {
    if (await nav.storage.persisted?.()) return true
    return await nav.storage.persist()
  } catch {
    return false
  }
}

export async function checkCapabilities(
  nav: NavigatorLike = navigator,
): Promise<DeviceCapabilities> {
  const [webgpu, storage, persisted] = await Promise.all([
    checkWebGPU(nav),
    getStorageEstimate(nav),
    isStoragePersisted(nav),
  ])
  return {
    webgpu,
    deviceMemoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    logicalCores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    storage,
    persisted,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
  }
}
