import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { errorText } from './mediapipe'
import type { PoseRequest, PoseResponse, WorkerScope } from './protocol'
import { createPoseLandmarker, detectPose } from './poseRuntime'

// Hinga's pose worker: the pose model runs here, off the main thread. Started
// by poseTracker.ts; one frame at a time.

const scope = self as unknown as WorkerScope<PoseRequest, PoseResponse>
let landmarker: PoseLandmarker | null = null

scope.onmessage = async ({ data: message }) => {
  if (message.type === 'init') {
    try {
      landmarker ??= await createPoseLandmarker()
      scope.postMessage({ type: 'ready' })
    } catch (error) {
      scope.postMessage({ type: 'init-error', message: errorText(error) })
    }
    return
  }
  try {
    if (!landmarker) throw new Error('The pose model is not loaded.')
    const start = performance.now()
    const points = detectPose(landmarker, message.bitmap, message.timestampMs)
    scope.postMessage({ type: 'pose', id: message.id, points, inferMs: performance.now() - start })
  } catch (error) {
    scope.postMessage({ type: 'frame-error', id: message.id, message: errorText(error) })
  } finally {
    message.bitmap.close()
  }
}
