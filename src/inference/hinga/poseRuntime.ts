import { PoseLandmarker } from '@mediapipe/tasks-vision'
import { loadModelFile } from '../../lib/modelCache'
import { filesetFromCache } from './mediapipe'
import { POSE_MODEL, VISION_RUNTIME } from './models'

// MediaPipe Pose Landmarker lite, VIDEO mode, CPU only (no GPU delegate on
// phones for now: see TASKS.md, platform notes). Used by pose.worker.ts, and on
// the main thread when the worker can't start (poseTracker.ts).

export type PosePoint = { x: number; y: number; visibility: number }

export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  const { fileset, release } = await filesetFromCache(VISION_RUNTIME)
  try {
    const model = new Uint8Array(await loadModelFile(POSE_MODEL, POSE_MODEL.files[0]))
    return await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      outputSegmentationMasks: false,
    })
  } finally {
    release()
  }
}

// The 33 landmarks of the one pose found, or null. Timestamps must increase.
export function detectPose(
  landmarker: PoseLandmarker,
  image: ImageBitmap | HTMLVideoElement,
  timestampMs: number,
): PosePoint[] | null {
  const pose = landmarker.detectForVideo(image, timestampMs).landmarks[0]
  return pose ? pose.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility ?? 1 })) : null
}
