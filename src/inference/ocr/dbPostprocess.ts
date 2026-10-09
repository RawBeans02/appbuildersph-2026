// DB (differentiable binarization) post-processing, simplified for the spike:
// threshold the probability map, find connected regions, keep axis-aligned
// boxes that score well, expand them ("unclip") and scale to the source image.
// PaddleOCR fits rotated rectangles; axis-aligned boxes are enough for a box
// photographed roughly straight, and are this spike's main simplification.

export type Box = { x0: number; y0: number; x1: number; y1: number; score: number }

export type DbOptions = {
  thresh: number
  boxThresh: number
  unclipRatio: number
  minSize: number
  maxCandidates: number
}

// The values in PP-OCRv5_mobile_det's inference.yml.
export const DB_DEFAULTS: DbOptions = {
  thresh: 0.3,
  boxThresh: 0.6,
  unclipRatio: 1.5,
  minSize: 3,
  maxCandidates: 1000,
}

export function dbBoxes(
  map: { data: Float32Array; width: number; height: number },
  source: { width: number; height: number },
  options: DbOptions = DB_DEFAULTS,
): Box[] {
  const { data, width, height } = map
  const seen = new Uint8Array(width * height)
  const stack = new Int32Array(width * height)
  const boxes: Box[] = []
  const scaleX = source.width / width
  const scaleY = source.height / height

  for (let start = 0; start < width * height && boxes.length < options.maxCandidates; start++) {
    if (seen[start] || data[start] <= options.thresh) continue
    // Flood-fill one region (8-connected) and track its extent.
    let top = 0
    stack[top++] = start
    seen[start] = 1
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    while (top > 0) {
      const i = stack[--top]
      const x = i % width
      const y = (i - x) / width
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const n = ny * width + nx
          if (!seen[n] && data[n] > options.thresh) {
            seen[n] = 1
            stack[top++] = n
          }
        }
      }
    }

    const w = maxX - minX + 1
    const h = maxY - minY + 1
    if (Math.min(w, h) < options.minSize) continue

    // Mean probability over the box, as PaddleOCR's box_score_fast.
    let sum = 0
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) sum += data[y * width + x]
    }
    const score = sum / (w * h)
    if (score < options.boxThresh) continue

    // Unclip: grow by area * ratio / perimeter on every side, since the
    // detector predicts shrunk text regions.
    const grow = (w * h * options.unclipRatio) / (2 * (w + h))
    const x0 = minX - grow
    const y0 = minY - grow
    const x1 = maxX + 1 + grow
    const y1 = maxY + 1 + grow
    if (Math.min(x1 - x0, y1 - y0) < options.minSize + 2) continue

    boxes.push({
      x0: clamp(Math.round(x0 * scaleX), 0, source.width),
      y0: clamp(Math.round(y0 * scaleY), 0, source.height),
      x1: clamp(Math.round(x1 * scaleX), 0, source.width),
      y1: clamp(Math.round(y1 * scaleY), 0, source.height),
      score,
    })
  }
  return sortReadingOrder(boxes)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// Top to bottom, then left to right for boxes on the same line (tops within
// 10 px), as PaddleOCR's sorted_boxes.
export function sortReadingOrder(boxes: Box[], lineTolerance = 10): Box[] {
  const sorted = [...boxes].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = i; j >= 0; j--) {
      const next = sorted[j + 1]
      const current = sorted[j]
      if (Math.abs(next.y0 - current.y0) < lineTolerance && next.x0 < current.x0) {
        sorted[j] = next
        sorted[j + 1] = current
      } else {
        break
      }
    }
  }
  return sorted
}
