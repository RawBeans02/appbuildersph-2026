import type { DeviceCapabilities } from './capabilities'

// Which inference backend this device would use, and why. Conservative on
// purpose: WebGPU only where it is known to behave. Reports (not yet verified
// on our phones, see TASKS.md "Platform notes") say WebGPU model runtimes run
// away on memory on iOS until the tab is killed, so WebKit gets WASM for now.

export type Platform = {
  // iPhone, iPad or iPod; every browser there runs on WebKit.
  ios: boolean
  // Safari's engine (all iOS browsers, and Safari on the Mac).
  webkit: boolean
  // Off in iOS Lockdown Mode, for example.
  webAssembly: boolean
  sharedArrayBuffer: boolean
}

export type Backend =
  | { kind: 'webgpu'; f16: boolean; reason: string }
  | { kind: 'wasm'; threads: number; reason: string; threadsReason: string }
  | { kind: 'none'; reason: string }

type PlatformNavigator = { userAgent: string; maxTouchPoints?: number }

export function detectPlatform(
  nav: PlatformNavigator = navigator,
  scope: object = globalThis,
): Platform {
  const ua = nav.userAgent
  // iPadOS reports a Mac user agent; touch support gives it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)
  const webkit = ios || (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua))
  return {
    ios,
    webkit,
    webAssembly: 'WebAssembly' in scope,
    sharedArrayBuffer: 'SharedArrayBuffer' in scope,
  }
}

// Mirrors ONNX Runtime Web's default thread count.
export function defaultThreadCount(logicalCores: number | null): number {
  return Math.min(4, Math.ceil((logicalCores ?? 1) / 2))
}

function whyNotWebGPU(caps: DeviceCapabilities, platform: Platform): string | null {
  if (platform.ios) return 'iPhone and iPad: WebGPU model runtimes are not proven safe on iOS yet'
  if (platform.webkit) return 'Safari: WebGPU model runtimes are not proven in Safari yet'
  switch (caps.webgpu.status) {
    case 'unsupported':
      return 'No WebGPU in this browser'
    case 'no-adapter':
      return 'WebGPU is present but has no usable GPU'
    case 'available':
      return caps.webgpu.isFallbackAdapter ? 'The only WebGPU adapter is a slow software fallback' : null
  }
}

export function pickBackend(caps: DeviceCapabilities, platform: Platform): Backend {
  const reason = whyNotWebGPU(caps, platform)
  if (reason === null) {
    // Only reached with a hardware adapter available.
    const f16 = caps.webgpu.status === 'available' && caps.webgpu.shaderF16
    return { kind: 'webgpu', f16, reason: 'WebGPU with a hardware GPU' }
  }
  if (!platform.webAssembly) {
    return { kind: 'none', reason: `${reason}, and WebAssembly is off in this browser` }
  }
  if (platform.ios) {
    return { kind: 'wasm', threads: 1, reason, threadsReason: 'Single-threaded on iOS' }
  }
  if (caps.crossOriginIsolated && platform.sharedArrayBuffer) {
    const threads = defaultThreadCount(caps.logicalCores)
    return { kind: 'wasm', threads, reason, threadsReason: `${threads} threads (cross-origin isolated)` }
  }
  return {
    kind: 'wasm',
    threads: 1,
    reason,
    threadsReason: 'Single-threaded: the page is not cross-origin isolated',
  }
}
