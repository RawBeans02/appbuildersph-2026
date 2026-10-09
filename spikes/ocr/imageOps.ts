// Pure image helpers for the OCR spike: resize, crop, rotate, and the tensor
// layouts PP-OCRv5 expects. Images are RGBA and row-major, like ImageData.
// Preprocessing follows the models' own inference.yml (PaddlePaddle on
// Hugging Face): BGR channel order, detection long side 960, recognition
// height 48 padded to at least 320 wide.

export type RGBAImage = { data: Uint8ClampedArray; width: number; height: number }

export function resizeBilinear(image: RGBAImage, width: number, height: number): RGBAImage {
  const out = new Uint8ClampedArray(width * height * 4)
  const scaleX = image.width / width
  const scaleY = image.height / height
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, (y + 0.5) * scaleY - 0.5)
    const y0 = Math.min(Math.floor(fy), image.height - 1)
    const y1 = Math.min(y0 + 1, image.height - 1)
    const wy = fy - y0
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, (x + 0.5) * scaleX - 0.5)
      const x0 = Math.min(Math.floor(fx), image.width - 1)
      const x1 = Math.min(x0 + 1, image.width - 1)
      const wx = fx - x0
      const a = (y0 * image.width + x0) * 4
      const b = (y0 * image.width + x1) * 4
      const c = (y1 * image.width + x0) * 4
      const d = (y1 * image.width + x1) * 4
      const o = (y * width + x) * 4
      for (let ch = 0; ch < 4; ch++) {
        const top = image.data[a + ch] * (1 - wx) + image.data[b + ch] * wx
        const bottom = image.data[c + ch] * (1 - wx) + image.data[d + ch] * wx
        out[o + ch] = top * (1 - wy) + bottom * wy
      }
    }
  }
  return { data: out, width, height }
}

// Detection input size: long side scaled to 960, each side a multiple of 32.
export function detInputSize(width: number, height: number, resizeLong = 960) {
  const ratio = resizeLong / Math.max(width, height)
  const round32 = (side: number) => Math.max(32, Math.round((side * ratio) / 32) * 32)
  return { width: round32(width), height: round32(height) }
}

const DET_MEAN = [0.485, 0.456, 0.406]
const DET_STD = [0.229, 0.224, 0.225]

// CHW float tensor in BGR order, normalized with the detector's mean and std.
export function toDetTensor(image: RGBAImage): Float32Array {
  const plane = image.width * image.height
  const out = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    const r = image.data[i * 4]
    const g = image.data[i * 4 + 1]
    const b = image.data[i * 4 + 2]
    out[i] = (b / 255 - DET_MEAN[0]) / DET_STD[0]
    out[plane + i] = (g / 255 - DET_MEAN[1]) / DET_STD[1]
    out[2 * plane + i] = (r / 255 - DET_MEAN[2]) / DET_STD[2]
  }
  return out
}

export const REC_HEIGHT = 48
export const REC_MIN_WIDTH = 320
// Bounds the work for one very long line.
export const REC_MAX_WIDTH = 1600

// The crop is resized to height 48 keeping its ratio, then right-padded to at
// least 320 wide, as PaddleOCR batches recognition inputs.
export function recInputWidth(width: number, height: number) {
  const resizedWidth = Math.min(REC_MAX_WIDTH, Math.max(1, Math.ceil((REC_HEIGHT * width) / height)))
  return { resizedWidth, tensorWidth: Math.max(REC_MIN_WIDTH, resizedWidth) }
}

// CHW float tensor in BGR order, scaled to [-1, 1]; the padding stays 0.
export function toRecTensor(crop: RGBAImage): { data: Float32Array; width: number } {
  const { resizedWidth, tensorWidth } = recInputWidth(crop.width, crop.height)
  const resized = resizeBilinear(crop, resizedWidth, REC_HEIGHT)
  const plane = REC_HEIGHT * tensorWidth
  const out = new Float32Array(3 * plane)
  for (let y = 0; y < REC_HEIGHT; y++) {
    for (let x = 0; x < resizedWidth; x++) {
      const src = (y * resizedWidth + x) * 4
      const dst = y * tensorWidth + x
      out[dst] = resized.data[src + 2] / 127.5 - 1
      out[plane + dst] = resized.data[src + 1] / 127.5 - 1
      out[2 * plane + dst] = resized.data[src] / 127.5 - 1
    }
  }
  return { data: out, width: tensorWidth }
}

export function crop(image: RGBAImage, x0: number, y0: number, x1: number, y1: number): RGBAImage {
  const left = Math.max(0, Math.floor(x0))
  const top = Math.max(0, Math.floor(y0))
  const width = Math.max(1, Math.min(image.width, Math.ceil(x1)) - left)
  const height = Math.max(1, Math.min(image.height, Math.ceil(y1)) - top)
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const start = ((top + y) * image.width + left) * 4
    out.set(image.data.subarray(start, start + width * 4), y * width * 4)
  }
  return { data: out, width, height }
}

// 90° counterclockwise, like numpy.rot90: PaddleOCR turns tall crops (vertical
// text) before recognition.
export function rotate90ccw(image: RGBAImage): RGBAImage {
  const width = image.height
  const height = image.width
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (x * image.width + (image.width - 1 - y)) * 4
      out.set(image.data.subarray(src, src + 4), (y * width + x) * 4)
    }
  }
  return { data: out, width, height }
}
