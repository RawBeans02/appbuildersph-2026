import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { errorText } from './mediapipe'
import type { PoseResponse } from './protocol'
import type { PosePoint } from './poseRuntime'
import { startWorker } from './workerClient'

// Runs the pose model in a worker (pose.worker.ts), so the page stays
// responsive during the count; each video frame goes over as a transferred
// ImageBitmap.
//
// POSE_IN_WORKER is the flag. When the worker can't start, the tracker falls
// back to the main thread on its own and says why (fallbackReason). Not yet
// verified on a phone: a worker needs module workers, dynamic import() of a
// blob URL, and an OffscreenCanvas that MediaPipe accepts (it only uses
// OffscreenCanvas on Safari 17 or later; older Safari has no canvas in a
// worker). The main-thread path needs none of that.
export const POSE_IN_WORKER = true

export type PoseFrame = { points: PosePoint[] | null; inferMs: number }

export type PoseTracker = {
  where: 'worker' | 'main-thread'
  // Why it runs on the main thread, when the worker was wanted.
  fallbackReason: string | null
  detect(video: HTMLVideoElement, timestampMs: number): Promise<PoseFrame>
  dispose(): void
}

async function startInWorker(): Promise<PoseTracker> {
  if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') {
    throw new Error('no module worker or createImageBitmap in this browser')
  }
  const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
  try {
    const client = await startWorker<Extract<PoseResponse, { type: 'pose' }>>(worker)
    return {
      where: 'worker',
      fallbackReason: null,
      async detect(video, timestampMs) {
        const bitmap = await createImageBitmap(video)
        const answer = await client.request({ type: 'frame', bitmap, timestampMs }, 'pose', [bitmap])
        return { points: answer.points, inferMs: answer.inferMs }
      },
      dispose: () => client.terminate(),
    }
  } catch (error) {
    worker.terminate()
    throw error
  }
}

async function startOnMainThread(fallbackReason: string | null): Promise<PoseTracker> {
  const { createPoseLandmarker, detectPose } = await import('./poseRuntime')
  const landmarker: PoseLandmarker = await createPoseLandmarker()
  return {
    where: 'main-thread',
    fallbackReason,
    async detect(video, timestampMs) {
      const start = performance.now()
      const points = detectPose(landmarker, video, timestampMs)
      return { points, inferMs: performance.now() - start }
    },
    dispose: () => landmarker.close(),
  }
}

export async function startPoseTracker(inWorker = POSE_IN_WORKER): Promise<PoseTracker> {
  if (!inWorker) return startOnMainThread(null)
  try {
    return await startInWorker()
  } catch (error) {
    return startOnMainThread(`the worker could not start (${errorText(error)})`)
  }
}
