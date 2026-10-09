import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { detectPlatform } from '../../lib/backend'
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
//
// Safari (WebKit, so every iPhone browser) starts on the main thread: in the
// WebKit CI run the worker started but its first detection failed creating a
// WebGL 2 context on the worker's canvas, while the same model on the main
// thread loaded and ran. Elsewhere, a worker that fails on its FIRST frame
// (not just at start) also falls back to the main thread for the rest of the
// count.
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

// Wraps the worker tracker: if its first detection fails, it's replaced by
// the main-thread tracker (started once) and the same frame is retried there.
// After a successful frame, errors pass through as usual. Exported for tests.
export function withFirstFrameFallback(
  worker: PoseTracker,
  startMain: (reason: string) => Promise<PoseTracker>,
): PoseTracker {
  let current = worker
  let succeeded = false
  let switching: Promise<PoseTracker> | null = null
  return {
    get where() {
      return current.where
    },
    get fallbackReason() {
      return current.fallbackReason
    },
    async detect(video, timestampMs) {
      if (switching) current = await switching
      try {
        const frame = await current.detect(video, timestampMs)
        succeeded = true
        return frame
      } catch (error) {
        if (succeeded || current !== worker) throw error
        worker.dispose()
        switching = startMain(`the worker could not run the pose model (${errorText(error)})`)
        current = await switching
        switching = null
        return current.detect(video, timestampMs)
      }
    },
    dispose: () => current.dispose(),
  }
}

export async function startPoseTracker(inWorker = POSE_IN_WORKER && !detectPlatform().webkit): Promise<PoseTracker> {
  if (!inWorker) {
    const reason = POSE_IN_WORKER && detectPlatform().webkit ? 'Safari runs it on the page; its worker canvas is not reliable' : null
    return startOnMainThread(reason)
  }
  let worker: PoseTracker
  try {
    worker = await startInWorker()
  } catch (error) {
    return startOnMainThread(`the worker could not start (${errorText(error)})`)
  }
  return withFirstFrameFallback(worker, startOnMainThread)
}
