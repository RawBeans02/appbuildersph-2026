// Torso region of interest from pose landmarks, and the mean luminance inside
// it. Coordinates are normalized to the frame: 0 is the left/top edge, 1 the
// right/bottom edge (the same convention as MediaPipe's NormalizedLandmark).

export type Point = { x: number; y: number; visibility?: number }
export type Box = { x0: number; y0: number; x1: number; y1: number }

// MediaPipe Pose landmark indices (BlazePose topology).
export const LEFT_SHOULDER = 11
export const RIGHT_SHOULDER = 12
export const LEFT_HIP = 23
export const RIGHT_HIP = 24

export const MIN_VISIBILITY = 0.5
// A box smaller than this share of the frame on either side is not a torso we
// can count breaths on.
export const MIN_BOX_SIDE = 0.05

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const visible = (p: Point | undefined, min: number): p is Point =>
  p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= min

// The box around both shoulders and both hips, clamped to the frame. Both
// shoulders must be visible; the hips may be out of frame (a close shot of the
// chest), in which case the model's predicted hip positions are clamped to the
// frame edge. Null means no torso this frame.
export function torsoBox(landmarks: readonly Point[] | undefined, minVisibility = MIN_VISIBILITY): Box | null {
  if (!landmarks) return null
  const ls = landmarks[LEFT_SHOULDER]
  const rs = landmarks[RIGHT_SHOULDER]
  if (!visible(ls, minVisibility) || !visible(rs, minVisibility)) return null
  const points = [ls, rs, landmarks[LEFT_HIP], landmarks[RIGHT_HIP]].filter(
    (p): p is Point => p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y),
  )
  const xs = points.map((p) => clamp01(p.x))
  const ys = points.map((p) => clamp01(p.y))
  const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  if (box.x1 - box.x0 < MIN_BOX_SIDE || box.y1 - box.y0 < MIN_BOX_SIDE) return null
  return box
}

// Height of the midpoint between the shoulders, 0 (top) to 1 (bottom).
export function shoulderMidY(landmarks: readonly Point[]): number {
  return (landmarks[LEFT_SHOULDER].y + landmarks[RIGHT_SHOULDER].y) / 2
}

// Mean luma (Rec. 601 weights, 0 to 255) of the RGBA pixels inside the box.
export function meanLuma(rgba: Uint8ClampedArray, width: number, height: number, box: Box): number {
  const x0 = Math.max(0, Math.floor(box.x0 * width))
  const x1 = Math.min(width, Math.ceil(box.x1 * width))
  const y0 = Math.max(0, Math.floor(box.y0 * height))
  const y1 = Math.min(height, Math.ceil(box.y1 * height))
  let sum = 0
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
      count++
    }
  }
  return count ? sum / count : NaN
}
