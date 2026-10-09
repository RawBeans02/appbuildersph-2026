import { ctcGreedyDecode } from './ctc'
import { dbBoxes, DB_DEFAULTS, type Box } from './dbPostprocess'
import { crop, detInputSize, resizeBilinear, rotate90ccw, toDetTensor, toRecTensor, type RGBAImage } from './imageOps'

// Detection, then recognition of each detected line. The models come in as
// two functions, so this runs the same with onnxruntime-web in the worker and
// in the CI model test.

export type OcrModels = {
  // Returns the probability map, height * width values.
  detect(tensor: Float32Array, width: number, height: number): Promise<Float32Array>
  // Returns softmax scores, steps * classes values.
  recognize(tensor: Float32Array, width: number): Promise<{ data: Float32Array; steps: number; classes: number }>
}

export type OcrLine = { box: Box; text: string; score: number }

export type OcrTimings = { detMs: number; recMs: number }

export type OcrOptions = {
  // PaddleOCR drops lines scoring under 0.5.
  dropScore?: number
  now?: () => number
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

export async function runOcr(
  image: RGBAImage,
  models: OcrModels,
  charset: string[],
  options: OcrOptions = {},
): Promise<{ lines: OcrLine[]; timings: OcrTimings }> {
  const { dropScore = 0.5, now = () => performance.now(), signal, onProgress } = options

  const detStart = now()
  const size = detInputSize(image.width, image.height)
  const detImage = resizeBilinear(image, size.width, size.height)
  const map = await models.detect(toDetTensor(detImage), size.width, size.height)
  const boxes = dbBoxes({ data: map, width: size.width, height: size.height }, image, DB_DEFAULTS)
  const detMs = now() - detStart
  signal?.throwIfAborted()
  onProgress?.(0.3)

  const recStart = now()
  const lines: OcrLine[] = []
  for (const [index, box] of boxes.entries()) {
    let region = crop(image, box.x0, box.y0, box.x1, box.y1)
    if (region.height / region.width >= 1.5) region = rotate90ccw(region)
    const tensor = toRecTensor(region)
    const out = await models.recognize(tensor.data, tensor.width)
    const { text, score } = ctcGreedyDecode(out.data, out.steps, out.classes, charset)
    if (text.trim() && score >= dropScore) lines.push({ box, text, score })
    signal?.throwIfAborted()
    onProgress?.(0.3 + (0.7 * (index + 1)) / boxes.length)
  }
  return { lines, timings: { detMs, recMs: now() - recStart } }
}
