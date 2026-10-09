import { describe, expect, it } from 'vitest'
import { defaultThreadCount, detectPlatform, pickBackend, type Platform } from './backend'
import type { DeviceCapabilities, WebGPUSupport } from './capabilities'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
  // iPadOS asks for desktop sites by default, so it looks like a Mac.
  ipadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
}

describe('detectPlatform', () => {
  const both = { WebAssembly: {}, SharedArrayBuffer: {} }

  it.each([
    ['iPhone Safari', UA.iphoneSafari, 5, { ios: true, webkit: true }],
    ['iPhone Chrome (WebKit underneath)', UA.iphoneChrome, 5, { ios: true, webkit: true }],
    ['iPad with a desktop user agent', UA.ipadDesktop, 5, { ios: true, webkit: true }],
    ['Mac Safari', UA.macSafari, 0, { ios: false, webkit: true }],
    ['Mac Chrome', UA.macChrome, 0, { ios: false, webkit: false }],
    ['Android Chrome', UA.androidChrome, 5, { ios: false, webkit: false }],
    ['Windows Edge', UA.windowsEdge, 0, { ios: false, webkit: false }],
    ['Firefox', UA.firefox, 0, { ios: false, webkit: false }],
  ])('%s', (_name, userAgent, maxTouchPoints, expected) => {
    expect(detectPlatform({ userAgent, maxTouchPoints }, both)).toMatchObject(expected)
  })

  it('reads WebAssembly and SharedArrayBuffer support from the global scope', () => {
    expect(detectPlatform({ userAgent: UA.macChrome }, {})).toMatchObject({
      webAssembly: false,
      sharedArrayBuffer: false,
    })
  })
})

function caps(webgpu: WebGPUSupport, overrides: Partial<DeviceCapabilities> = {}): DeviceCapabilities {
  return {
    webgpu,
    deviceMemoryGB: 8,
    logicalCores: 8,
    storage: null,
    persisted: null,
    crossOriginIsolated: false,
    ...overrides,
  }
}

const gpu = (overrides: Partial<Extract<WebGPUSupport, { status: 'available' }>> = {}): WebGPUSupport => ({
  status: 'available',
  shaderF16: true,
  isFallbackAdapter: false,
  maxBufferSize: 2 ** 30,
  maxStorageBufferBindingSize: 2 ** 30,
  vendor: 'test',
  architecture: 'test',
  ...overrides,
})

const desktop: Platform = { ios: false, webkit: false, webAssembly: true, sharedArrayBuffer: true }
const iphone: Platform = { ios: true, webkit: true, webAssembly: true, sharedArrayBuffer: true }
const macSafari: Platform = { ios: false, webkit: true, webAssembly: true, sharedArrayBuffer: true }

describe('pickBackend', () => {
  it('picks WebGPU with a hardware adapter outside WebKit, with or without f16', () => {
    expect(pickBackend(caps(gpu()), desktop)).toMatchObject({ kind: 'webgpu', f16: true })
    expect(pickBackend(caps(gpu({ shaderF16: false })), desktop)).toMatchObject({ kind: 'webgpu', f16: false })
  })

  it('keeps iPhones on single-threaded WASM, even with WebGPU and isolation', () => {
    const result = pickBackend(caps(gpu(), { crossOriginIsolated: true }), iphone)
    expect(result).toMatchObject({ kind: 'wasm', threads: 1, threadsReason: 'Single-threaded on iOS' })
    expect(result.reason).toMatch(/iOS/)
  })

  it('keeps Safari on the Mac on WASM until WebGPU is proven there', () => {
    expect(pickBackend(caps(gpu()), macSafari)).toMatchObject({ kind: 'wasm', reason: expect.stringMatching(/Safari/) })
  })

  it('falls back to WASM without WebGPU, without an adapter, or with a software adapter', () => {
    for (const webgpu of [{ status: 'unsupported' }, { status: 'no-adapter' }, gpu({ isFallbackAdapter: true })] as const) {
      expect(pickBackend(caps(webgpu), desktop).kind).toBe('wasm')
    }
  })

  it('uses WASM threads only when the page is cross-origin isolated', () => {
    expect(pickBackend(caps({ status: 'unsupported' }), desktop)).toMatchObject({ kind: 'wasm', threads: 1 })
    expect(pickBackend(caps({ status: 'unsupported' }, { crossOriginIsolated: true }), desktop)).toMatchObject({
      kind: 'wasm',
      threads: 4,
    })
    const noSab = { ...desktop, sharedArrayBuffer: false }
    expect(pickBackend(caps({ status: 'unsupported' }, { crossOriginIsolated: true }), noSab)).toMatchObject({
      threads: 1,
    })
  })

  it('reports none when neither WebGPU nor WebAssembly is usable', () => {
    const result = pickBackend(caps({ status: 'unsupported' }), { ...desktop, webAssembly: false })
    expect(result.kind).toBe('none')
  })
})

describe('defaultThreadCount', () => {
  it('uses half the logical cores, at least 1 and at most 4', () => {
    expect(defaultThreadCount(null)).toBe(1)
    expect(defaultThreadCount(1)).toBe(1)
    expect(defaultThreadCount(4)).toBe(2)
    expect(defaultThreadCount(6)).toBe(3)
    expect(defaultThreadCount(16)).toBe(4)
  })
})
