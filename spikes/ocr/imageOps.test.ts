import { describe, expect, it } from 'vitest'
import {
  crop,
  detInputSize,
  recInputWidth,
  resizeBilinear,
  rotate90ccw,
  toDetTensor,
  toRecTensor,
  type RGBAImage,
} from './imageOps'

// A width x height image where each pixel's RGB encodes its position.
function gradient(width: number, height: number): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set([x, y, 100, 255], (y * width + x) * 4)
  }
  return { data, width, height }
}

const pixel = (image: RGBAImage, x: number, y: number) =>
  Array.from(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4))

describe('detInputSize', () => {
  it('scales the long side to 960 and rounds both sides to multiples of 32', () => {
    expect(detInputSize(1280, 960)).toEqual({ width: 960, height: 736 })
    expect(detInputSize(960, 1280)).toEqual({ width: 736, height: 960 })
    expect(detInputSize(400, 100)).toEqual({ width: 960, height: 256 })
    expect(detInputSize(2000, 10)).toEqual({ width: 960, height: 32 })
  })
})

describe('toDetTensor', () => {
  it('writes channels in BGR order, normalized with the detector mean and std', () => {
    const image = { data: new Uint8ClampedArray([255, 0, 51, 255]), width: 1, height: 1 }
    const [b, g, r] = toDetTensor(image)
    expect(b).toBeCloseTo((0.2 - 0.485) / 0.229, 5)
    expect(g).toBeCloseTo((0 - 0.456) / 0.224, 5)
    expect(r).toBeCloseTo((1 - 0.406) / 0.225, 5)
  })
})

describe('recognition input', () => {
  it('keeps the ratio at height 48, pads to at least 320 and caps very long lines', () => {
    expect(recInputWidth(100, 48)).toEqual({ resizedWidth: 100, tensorWidth: 320 })
    expect(recInputWidth(200, 24)).toEqual({ resizedWidth: 400, tensorWidth: 400 })
    expect(recInputWidth(10000, 10)).toEqual({ resizedWidth: 1600, tensorWidth: 1600 })
  })

  it('writes BGR scaled to [-1, 1] and leaves the right padding at 0', () => {
    const data = new Uint8ClampedArray(10 * 48 * 4)
    for (let i = 0; i < 10 * 48; i++) data.set([255, 0, 51, 255], i * 4)
    const { data: tensor, width } = toRecTensor({ data, width: 10, height: 48 })
    expect(width).toBe(320)
    const plane = 48 * 320
    expect(tensor[0]).toBeCloseTo(51 / 127.5 - 1, 5)
    expect(tensor[plane]).toBeCloseTo(-1, 5)
    expect(tensor[2 * plane]).toBeCloseTo(1, 5)
    expect(tensor[10]).toBe(0)
    expect(tensor[2 * plane + 319]).toBe(0)
  })
})

describe('resizeBilinear', () => {
  it('returns the same pixels at the same size', () => {
    const image = gradient(5, 4)
    expect(resizeBilinear(image, 5, 4).data).toEqual(image.data)
  })

  it('averages when halving', () => {
    const image = { data: new Uint8ClampedArray([0, 0, 0, 255, 200, 200, 200, 255]), width: 2, height: 1 }
    expect(pixel(resizeBilinear(image, 1, 1), 0, 0)).toEqual([100, 100, 100, 255])
  })
})

describe('crop and rotate', () => {
  it('crops a region and clamps it to the image', () => {
    const region = crop(gradient(10, 10), 2, 3, 5, 5)
    expect([region.width, region.height]).toEqual([3, 2])
    expect(pixel(region, 0, 0)).toEqual([2, 3, 100, 255])
    const edge = crop(gradient(10, 10), -4, 8, 30, 30)
    expect([edge.width, edge.height]).toEqual([10, 2])
  })

  it('rotates 90° counterclockwise like numpy.rot90', () => {
    // 3 wide, 2 tall: the top-right pixel ends up top-left.
    const rotated = rotate90ccw(gradient(3, 2))
    expect([rotated.width, rotated.height]).toEqual([2, 3])
    expect(pixel(rotated, 0, 0)).toEqual([2, 0, 100, 255])
    expect(pixel(rotated, 1, 2)).toEqual([0, 1, 100, 255])
  })
})
