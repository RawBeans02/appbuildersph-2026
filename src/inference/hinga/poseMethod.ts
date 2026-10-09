import { COUNT_METHOD, type CountMethod, type CountMethodId } from './method'
import { startPoseTracker, type PoseTracker } from './poseTracker'
import { LEFT_SHOULDER, meanLuma, RIGHT_SHOULDER, shoulderMidY, torsoBox } from './roi'

// The 'pose-torso' count method: the pose model finds the torso box; during the
// count, each frame gives the mean brightness inside the box locked at the
// start ('luma') and the shoulder midpoint height ('shoulder').

// The brightness is measured on a downscaled copy of the frame.
const LUMA_WIDTH = 160

export function createPoseTorsoMethod(): CountMethod {
  let tracker: PoseTracker | null = null
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })!

  return {
    id: 'pose-torso',
    async start() {
      const start = performance.now()
      tracker = await startPoseTracker()
      return { loadMs: performance.now() - start, where: tracker.where, note: tracker.fallbackReason }
    },
    async measure(video, timestampMs, locked) {
      if (!tracker) throw new Error('The pose model is not loaded.')
      let luma: number | null = null
      if (locked) {
        const height = Math.max(1, Math.round((LUMA_WIDTH * video.videoHeight) / video.videoWidth))
        if (canvas.width !== LUMA_WIDTH || canvas.height !== height) {
          canvas.width = LUMA_WIDTH
          canvas.height = height
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
        luma = meanLuma(pixels.data, pixels.width, pixels.height, locked)
      }
      const { points, inferMs } = await tracker.detect(video, timestampMs)
      const region = torsoBox(points ?? undefined)
      const signals: Record<string, number | null> = locked
        ? { luma, shoulder: region && points ? shoulderMidY(points) : null }
        : {}
      return {
        region,
        signals,
        points: region && points ? [points[LEFT_SHOULDER], points[RIGHT_SHOULDER]] : [],
        inferMs,
      }
    },
    dispose() {
      tracker?.dispose()
      tracker = null
    },
  }
}

export function createCountMethod(id: CountMethodId = COUNT_METHOD): CountMethod {
  switch (id) {
    case 'pose-torso':
      return createPoseTorsoMethod()
    case 'tap-region':
      throw new Error('The tap-to-select chest method (fallback 1) is not built yet.')
  }
}
