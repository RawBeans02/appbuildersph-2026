import { fitWithin, MAX_IMAGE_SIDE } from '../../../lib/image'

// Finds a QR code in a camera frame or a photo, on this device. Uses the
// browser's BarcodeDetector where it reads QR codes (Chrome on macOS, Android
// and ChromeOS), else the bundled jsQR decoder, so scanning works offline in
// any browser.

export type DecoderEngine = 'barcode-detector' | 'jsqr'

// The camera's <video> element, or a decoded photo.
export type QrSource = { image: CanvasImageSource; width: number; height: number }

// `thorough` (for a photo): read at a larger size, also try light-on-dark
// codes, and fall back to jsQR if BarcodeDetector finds nothing.
export type DecodeOptions = { thorough?: boolean }

export type QrDecoder = {
  engine: DecoderEngine
  decode(source: QrSource, options?: DecodeOptions): Promise<string | null>
}

type BarcodeDetectorInstance = { detect(image: ImageBitmapSource): Promise<{ rawValue: string }[]> }

// The Shape Detection API isn't in TypeScript's DOM types yet.
export type BarcodeDetectorClass = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance
  getSupportedFormats?: () => Promise<string[]>
}

// Camera frames are scaled down to this long side before jsQR reads them:
// enough for a phone's QR held in front of a laptop camera, and quick.
export const FRAME_MAX_SIDE = 800

// A BarcodeDetector that reads QR codes, or null when this browser has none.
export async function pickBarcodeDetector(
  Detector: BarcodeDetectorClass | undefined,
): Promise<BarcodeDetectorInstance | null> {
  if (typeof Detector !== 'function') return null
  try {
    const formats = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : ['qr_code']
    return formats.includes('qr_code') ? new Detector({ formats: ['qr_code'] }) : null
  } catch {
    return null
  }
}

async function createJsQrDecoder(): Promise<QrDecoder> {
  const { decodeRgba } = await import('./jsqrDecode')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('This browser has no 2D canvas to read the image.')
  return {
    engine: 'jsqr',
    async decode(source, options = {}) {
      const size = fitWithin(source.width, source.height, options.thorough ? MAX_IMAGE_SIDE : FRAME_MAX_SIDE)
      if (canvas.width !== size.width) canvas.width = size.width
      if (canvas.height !== size.height) canvas.height = size.height
      context.drawImage(source.image, 0, 0, size.width, size.height)
      const { data } = context.getImageData(0, 0, size.width, size.height)
      return decodeRgba(data, size.width, size.height, options.thorough)
    },
  }
}

export async function createQrDecoder(
  env: { BarcodeDetector?: BarcodeDetectorClass } = globalThis as { BarcodeDetector?: BarcodeDetectorClass },
  createFallback: () => Promise<QrDecoder> = createJsQrDecoder,
): Promise<QrDecoder> {
  const detector = await pickBarcodeDetector(env.BarcodeDetector)
  let fallback: Promise<QrDecoder> | null = null
  const getFallback = () => (fallback ??= createFallback())
  if (!detector) return getFallback()

  const decoder: QrDecoder = {
    engine: 'barcode-detector',
    async decode(source, options = {}) {
      let found: { rawValue: string }[]
      try {
        found = await detector.detect(source.image as ImageBitmapSource)
      } catch {
        // Some platforms list QR support but fail at detect time: use jsQR from now on.
        const js = await getFallback()
        decoder.engine = js.engine
        decoder.decode = js.decode
        return js.decode(source, options)
      }
      const text = found.find((code) => code.rawValue)?.rawValue ?? null
      if (text || !options.thorough) return text
      return (await getFallback()).decode(source, options)
    },
  }
  return decoder
}

// A photo of a QR (the file picker fallback when there's no camera).
export async function decodeImageFile(decoder: QrDecoder, file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file)
  try {
    return await decoder.decode({ image: bitmap, width: bitmap.width, height: bitmap.height }, { thorough: true })
  } finally {
    bitmap.close()
  }
}
