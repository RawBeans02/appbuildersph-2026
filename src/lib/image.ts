// Downscales a photo before an on-device vision model sees it. iPhone Safari
// kills a tab without an error when a page decodes or holds big images, so
// every input is capped at MAX_IMAGE_SIDE px on its long side. The source is
// still decoded once at full size; this limits what the page keeps afterwards.

export const MAX_IMAGE_SIDE = 1280

export type FittedSize = { width: number; height: number; scaled: boolean }

export type DownscaleOptions = { maxSide?: number; type?: string; quality?: number }

export type DownscaledImage = FittedSize & { blob: Blob }

type Context2DLike = {
  imageSmoothingQuality: ImageSmoothingQuality
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, w: number, h: number): void
  drawImage(image: ImageBitmap, dx: number, dy: number, dw: number, dh: number): void
  getImageData?(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray }
}

// The parts of a canvas we use. OffscreenCanvas and an HTML canvas both fit; tests pass fakes.
export type CanvasLike = { getContext(contextId: '2d'): Context2DLike | null } & (
  | { convertToBlob(options?: ImageEncodeOptions): Promise<Blob> }
  | { toBlob(callback: BlobCallback, type?: string, quality?: number): void }
)

// Defaults to the browser's createImageBitmap and canvas; tests pass fakes.
export type ImageDeps = {
  createImageBitmap?: (image: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>
  createCanvas?: (width: number, height: number) => CanvasLike
}

function assertPositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number, got ${value}`)
  }
}

// Keeps the aspect ratio and never upscales. Each side is at least 1 px, so a
// very thin image still gives a drawable canvas.
export function fitWithin(width: number, height: number, maxSide = MAX_IMAGE_SIDE): FittedSize {
  assertPositive('width', width)
  assertPositive('height', height)
  assertPositive('maxSide', maxSide)
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: scale < 1,
  }
}

// OffscreenCanvas also works in a Web Worker; the HTML canvas is the fallback.
function createDefaultCanvas(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function encode(canvas: CanvasLike, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Could not encode the image as ${type}`))),
      type,
      quality,
    )
  })
}

// from-image applies the EXIF orientation, so phone photos aren't sideways.
// Older browsers only accept 'none' | 'flipY' and reject the option with a
// TypeError; decode without it there rather than fail (the photo may be sideways).
async function decodeUpright(
  decode: NonNullable<ImageDeps['createImageBitmap']>,
  source: Blob,
): Promise<ImageBitmap> {
  try {
    return await decode(source, { imageOrientation: 'from-image' })
  } catch (error) {
    if (error instanceof TypeError) return decode(source)
    throw error
  }
}

export async function downscaleImage(
  source: Blob,
  options: DownscaleOptions = {},
  deps: ImageDeps = {},
): Promise<DownscaledImage> {
  const { maxSide = MAX_IMAGE_SIDE, type = 'image/jpeg', quality = 0.9 } = options
  const decode = deps.createImageBitmap ?? createImageBitmap
  const createCanvas = deps.createCanvas ?? createDefaultCanvas
  const bitmap = await decodeUpright(decode, source)
  try {
    const size = fitWithin(bitmap.width, bitmap.height, maxSide)
    // Re-encode even when no scaling is needed: it strips EXIF and GPS metadata,
    // normalizes the type, and keeps the returned size accurate.
    const canvas = createCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get a 2d canvas context to downscale the image')
    ctx.imageSmoothingQuality = 'high'
    // JPEG has no transparency: without a white fill, clear pixels turn black.
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size.width, size.height)
    }
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    const blob = await encode(canvas, type, quality)
    return { blob, ...size }
  } finally {
    // Frees the decoded pixels now instead of waiting for garbage collection.
    bitmap.close()
  }
}

export type Pixels = FittedSize & { data: Uint8ClampedArray }

// Decodes a photo straight to RGBA pixels, at most maxSide on its long side,
// for a model that takes raw pixels (OCR). Skips the re-encode that
// downscaleImage does, so it's faster when no file is needed.
export async function imageToPixels(
  source: Blob,
  options: { maxSide?: number } = {},
  deps: ImageDeps = {},
): Promise<Pixels> {
  const decode = deps.createImageBitmap ?? createImageBitmap
  const createCanvas = deps.createCanvas ?? createDefaultCanvas
  const bitmap = await decodeUpright(decode, source)
  try {
    const size = fitWithin(bitmap.width, bitmap.height, options.maxSide ?? MAX_IMAGE_SIDE)
    const ctx = createCanvas(size.width, size.height).getContext('2d')
    if (!ctx?.getImageData) throw new Error('Could not get a 2d canvas context to read the image')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    return { ...size, data: ctx.getImageData(0, 0, size.width, size.height).data }
  } finally {
    bitmap.close()
  }
}
