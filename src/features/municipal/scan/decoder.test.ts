import qrcode from 'qrcode-generator'
import { describe, expect, it, vi } from 'vitest'
import { municipalSampleQrTexts } from '../../../data/seed/municipal'
import { createQrDecoder, pickBarcodeDetector, type BarcodeDetectorClass, type QrDecoder, type QrSource } from './decoder'
import { decodeRgba } from './jsqrDecode'

// Draws QR text as RGBA pixels the way the Send screen does (qrcode-generator,
// error correction M, a 4-module quiet zone), `scale` pixels per module.
function renderQr(text: string, scale = 4, invert = false) {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  const modules = qr.getModuleCount() + 8
  const size = modules * scale
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - 4
      const col = Math.floor(x / scale) - 4
      const inside = row >= 0 && col >= 0 && row < modules - 8 && col < modules - 8
      const dark = inside && qr.isDark(row, col)
      const value = dark !== invert ? 0 : 255
      data.set([value, value, value, 255], (y * size + x) * 4)
    }
  }
  return { data, width: size, height: size }
}

describe('jsQR fallback (decodeRgba)', () => {
  it('reads each pre-made barangay QR as drawn by the Send screen', () => {
    for (const text of municipalSampleQrTexts) {
      const { data, width, height } = renderQr(text)
      expect(decodeRgba(data, width, height)).toBe(text)
    }
  })

  it('reads light-on-dark codes only when asked to try inverted', () => {
    const text = municipalSampleQrTexts[0]
    const { data, width, height } = renderQr(text, 4, true)
    expect(decodeRgba(data, width, height)).toBeNull()
    expect(decodeRgba(data, width, height, true)).toBe(text)
  })

  it('returns null for a frame with no QR', () => {
    const blank = new Uint8ClampedArray(200 * 200 * 4).fill(255)
    expect(decodeRgba(blank, 200, 200)).toBeNull()
  })
})

const source: QrSource = { image: {} as CanvasImageSource, width: 640, height: 480 }

function fakeDetector(options: { formats?: string[]; detect?: () => Promise<{ rawValue: string }[]> }): BarcodeDetectorClass {
  return class {
    static getSupportedFormats = async () => options.formats ?? ['qr_code', 'ean_13']
    detect = options.detect ?? (async () => [])
  } as unknown as BarcodeDetectorClass
}

const fakeFallback = (text: string | null): (() => Promise<QrDecoder>) =>
  vi.fn(async () => ({ engine: 'jsqr' as const, decode: async () => text }))

describe('picking the decoder', () => {
  it('uses BarcodeDetector only when it lists qr_code', async () => {
    expect(await pickBarcodeDetector(undefined)).toBeNull()
    expect(await pickBarcodeDetector(fakeDetector({ formats: ['ean_13'] }))).toBeNull()
    expect(await pickBarcodeDetector(fakeDetector({}))).not.toBeNull()
    const throwing = fakeDetector({})
    throwing.getSupportedFormats = async () => {
      throw new Error('not supported')
    }
    expect(await pickBarcodeDetector(throwing)).toBeNull()
  })

  it('falls back to jsQR without BarcodeDetector', async () => {
    const fallback = fakeFallback('AGP1.js')
    const decoder = await createQrDecoder({}, fallback)
    expect(decoder.engine).toBe('jsqr')
    expect(await decoder.decode(source)).toBe('AGP1.js')
  })

  it('returns what BarcodeDetector reads, without loading jsQR', async () => {
    const fallback = fakeFallback(null)
    const decoder = await createQrDecoder(
      { BarcodeDetector: fakeDetector({ detect: async () => [{ rawValue: '' }, { rawValue: 'AGP1.native' }] }) },
      fallback,
    )
    expect(decoder.engine).toBe('barcode-detector')
    expect(await decoder.decode(source)).toBe('AGP1.native')
    expect(fallback).not.toHaveBeenCalled()
  })

  it('switches to jsQR for good when BarcodeDetector fails at detect time', async () => {
    const detect = vi.fn(async () => {
      throw new DOMException('Barcode detection service unavailable', 'NotSupportedError')
    })
    const decoder = await createQrDecoder({ BarcodeDetector: fakeDetector({ detect }) }, fakeFallback('AGP1.js'))
    expect(await decoder.decode(source)).toBe('AGP1.js')
    expect(decoder.engine).toBe('jsqr')
    expect(await decoder.decode(source)).toBe('AGP1.js')
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it('tries jsQR on a photo when BarcodeDetector finds nothing (thorough)', async () => {
    const decoder = await createQrDecoder({ BarcodeDetector: fakeDetector({}) }, fakeFallback('AGP1.photo'))
    expect(await decoder.decode(source)).toBeNull()
    expect(await decoder.decode(source, { thorough: true })).toBe('AGP1.photo')
  })
})
