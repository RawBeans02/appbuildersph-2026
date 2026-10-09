import { afterEach, describe, expect, it, vi } from 'vitest'
import { downscaleImage, fitWithin, MAX_IMAGE_SIDE, type CanvasLike } from './image'

const photo = new Blob(['photo bytes'], { type: 'image/jpeg' })

function fakeBitmap(width: number, height: number) {
  return { width, height, close: vi.fn() }
}

function fakeContext() {
  return {
    imageSmoothingQuality: 'low' as ImageSmoothingQuality,
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  }
}

// Like an OffscreenCanvas: encodes with convertToBlob. withContext false: no 2d context.
function fakeOffscreenCanvas(
  encode = async (options?: ImageEncodeOptions) => new Blob(['encoded'], { type: options?.type }),
  withContext = true,
) {
  const ctx = fakeContext()
  const convertToBlob = vi.fn(encode)
  return { canvas: { getContext: () => (withContext ? ctx : null), convertToBlob }, ctx, convertToBlob }
}

// Like an HTML canvas: no convertToBlob, encodes through the toBlob callback.
function fakeHtmlCanvas(encodes = true) {
  const ctx = fakeContext()
  const toBlob = vi.fn((callback: BlobCallback, type?: string) =>
    callback(encodes ? new Blob(['encoded'], { type }) : null),
  )
  return { canvas: { width: 0, height: 0, getContext: () => ctx, toBlob }, ctx, toBlob }
}

function fakeDeps(bitmap: ReturnType<typeof fakeBitmap>, canvas: CanvasLike) {
  return {
    createImageBitmap: vi.fn(async () => bitmap),
    createCanvas: vi.fn(() => canvas),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fitWithin', () => {
  it('scales a landscape photo so its long side is 1280 px', () => {
    expect(MAX_IMAGE_SIDE).toBe(1280)
    expect(fitWithin(4032, 3024)).toEqual({ width: 1280, height: 960, scaled: true })
  })

  it('scales a portrait photo by its height', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 960, height: 1280, scaled: true })
  })

  it('scales a square image to the limit on both sides', () => {
    expect(fitWithin(3000, 3000)).toEqual({ width: 1280, height: 1280, scaled: true })
  })

  it('never upscales a small image', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scaled: false })
  })

  it('leaves an image whose long side is exactly the limit', () => {
    expect(fitWithin(1280, 720)).toEqual({ width: 1280, height: 720, scaled: false })
    expect(fitWithin(720, 1280)).toEqual({ width: 720, height: 1280, scaled: false })
  })

  it('never returns a 0 px side for an extreme aspect ratio', () => {
    expect(fitWithin(10000, 10)).toEqual({ width: 1280, height: 1, scaled: true })
    // 10 * 1280 / 100000 = 0.128, which would round to 0.
    expect(fitWithin(100000, 10)).toEqual({ width: 1280, height: 1, scaled: true })
    expect(fitWithin(10, 100000)).toEqual({ width: 1, height: 1280, scaled: true })
  })

  it('takes a custom size limit', () => {
    expect(fitWithin(4032, 3024, 512)).toEqual({ width: 512, height: 384, scaled: true })
    expect(fitWithin(400, 300, 512)).toEqual({ width: 400, height: 300, scaled: false })
  })

  it('rejects sizes and limits that are not positive finite numbers', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => fitWithin(bad, 100)).toThrow(RangeError)
      expect(() => fitWithin(100, bad)).toThrow(RangeError)
      expect(() => fitWithin(100, 100, bad)).toThrow(RangeError)
    }
  })
})

describe('downscaleImage', () => {
  it('decodes with the EXIF orientation and draws at the fitted size with high-quality smoothing', async () => {
    const bitmap = fakeBitmap(4032, 3024)
    const { canvas, ctx } = fakeOffscreenCanvas()
    const deps = fakeDeps(bitmap, canvas)
    const result = await downscaleImage(photo, {}, deps)
    expect(deps.createImageBitmap).toHaveBeenCalledWith(photo, { imageOrientation: 'from-image' })
    expect(deps.createCanvas).toHaveBeenCalledWith(1280, 960)
    expect(ctx.imageSmoothingQuality).toBe('high')
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1280, 960)
    expect(result).toMatchObject({ width: 1280, height: 960, scaled: true })
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('fills white under a JPEG so transparent pixels do not turn black, but not under WebP', async () => {
    const jpeg = fakeOffscreenCanvas()
    await downscaleImage(photo, {}, fakeDeps(fakeBitmap(4032, 3024), jpeg.canvas))
    expect(jpeg.ctx.fillStyle).toBe('#ffffff')
    expect(jpeg.ctx.fillRect).toHaveBeenCalledWith(0, 0, 1280, 960)
    expect(jpeg.ctx.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      jpeg.ctx.drawImage.mock.invocationCallOrder[0],
    )

    const webp = fakeOffscreenCanvas()
    await downscaleImage(photo, { type: 'image/webp' }, fakeDeps(fakeBitmap(4032, 3024), webp.canvas))
    expect(webp.ctx.fillRect).not.toHaveBeenCalled()
  })

  it('decodes without the orientation option when an older browser rejects it', async () => {
    const bitmap = fakeBitmap(4032, 3024)
    const createImageBitmap = vi.fn(async (_image: Blob, options?: ImageBitmapOptions) => {
      if (options) throw new TypeError("The provided value 'from-image' is not a valid enum value")
      return bitmap
    })
    const { canvas } = fakeOffscreenCanvas()
    const result = await downscaleImage(photo, {}, { createImageBitmap, createCanvas: () => canvas })
    expect(createImageBitmap).toHaveBeenCalledTimes(2)
    expect(createImageBitmap).toHaveBeenLastCalledWith(photo)
    expect(result).toMatchObject({ width: 1280, height: 960 })
  })

  it('does not retry when the image itself cannot be decoded', async () => {
    const createImageBitmap = vi.fn(async () => {
      throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
    })
    const { canvas } = fakeOffscreenCanvas()
    await expect(
      downscaleImage(photo, {}, { createImageBitmap, createCanvas: () => canvas }),
    ).rejects.toThrow('could not be decoded')
    expect(createImageBitmap).toHaveBeenCalledOnce()
  })

  it('encodes as JPEG at 0.9 quality by default', async () => {
    const { canvas, convertToBlob } = fakeOffscreenCanvas()
    const result = await downscaleImage(photo, {}, fakeDeps(fakeBitmap(4032, 3024), canvas))
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.9 })
    expect(result.blob.type).toBe('image/jpeg')
  })

  it('passes a custom size limit, type and quality through', async () => {
    const { canvas, convertToBlob } = fakeOffscreenCanvas()
    const deps = fakeDeps(fakeBitmap(4032, 3024), canvas)
    const result = await downscaleImage(photo, { maxSide: 512, type: 'image/webp', quality: 0.7 }, deps)
    expect(deps.createCanvas).toHaveBeenCalledWith(512, 384)
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/webp', quality: 0.7 })
    expect(result).toMatchObject({ width: 512, height: 384, scaled: true })
    expect(result.blob.type).toBe('image/webp')
  })

  it('still re-encodes an image that is already small', async () => {
    const bitmap = fakeBitmap(640, 480)
    const { canvas, ctx, convertToBlob } = fakeOffscreenCanvas()
    const result = await downscaleImage(photo, {}, fakeDeps(bitmap, canvas))
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 640, 480)
    expect(convertToBlob).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ width: 640, height: 480, scaled: false })
    expect(result.blob).not.toBe(photo)
  })

  it('closes the bitmap even when encoding fails', async () => {
    const bitmap = fakeBitmap(4032, 3024)
    const { canvas } = fakeOffscreenCanvas(async () => {
      throw new Error('encode failed')
    })
    await expect(downscaleImage(photo, {}, fakeDeps(bitmap, canvas))).rejects.toThrow('encode failed')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('rejects with a clear error when the canvas has no 2d context', async () => {
    const bitmap = fakeBitmap(4032, 3024)
    const { canvas, convertToBlob } = fakeOffscreenCanvas(undefined, false)
    await expect(downscaleImage(photo, {}, fakeDeps(bitmap, canvas))).rejects.toThrow(
      'Could not get a 2d canvas context',
    )
    expect(convertToBlob).not.toHaveBeenCalled()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('encodes through toBlob on a canvas without convertToBlob', async () => {
    const { canvas, toBlob } = fakeHtmlCanvas()
    const result = await downscaleImage(photo, { quality: 0.8 }, fakeDeps(fakeBitmap(4032, 3024), canvas))
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8)
    expect(result.blob.type).toBe('image/jpeg')
  })

  it('rejects and closes the bitmap when toBlob gives no blob', async () => {
    const bitmap = fakeBitmap(4032, 3024)
    const { canvas } = fakeHtmlCanvas(false)
    await expect(downscaleImage(photo, {}, fakeDeps(bitmap, canvas))).rejects.toThrow(
      'Could not encode the image as image/jpeg',
    )
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('creates an OffscreenCanvas by default when the browser has one', async () => {
    const { canvas, convertToBlob } = fakeOffscreenCanvas()
    const OffscreenCanvasMock = vi.fn(function () {
      return canvas
    })
    vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock)
    const bitmap = fakeBitmap(4032, 3024)
    await downscaleImage(photo, {}, { createImageBitmap: async () => bitmap })
    expect(OffscreenCanvasMock).toHaveBeenCalledWith(1280, 960)
    expect(convertToBlob).toHaveBeenCalledOnce()
  })

  it('falls back to an HTML canvas when OffscreenCanvas is missing', async () => {
    const { canvas, toBlob } = fakeHtmlCanvas()
    const createElement = vi.fn(() => canvas)
    vi.stubGlobal('document', { createElement })
    const bitmap = fakeBitmap(3024, 4032)
    const result = await downscaleImage(photo, {}, { createImageBitmap: async () => bitmap })
    expect(createElement).toHaveBeenCalledWith('canvas')
    expect(canvas).toMatchObject({ width: 960, height: 1280 })
    expect(toBlob).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ width: 960, height: 1280, scaled: true })
  })
})
