import type { CryWindow } from './cry'
import type { PosePoint } from './poseRuntime'

// Messages between the main thread and Hinga's two workers. Types only.
// One frame (or one piece of audio) is in flight at a time; the main thread
// waits for the answer before sending the next.

export type PoseRequest =
  | { type: 'init' }
  // The bitmap is transferred, and closed by the worker.
  | { type: 'frame'; id: number; bitmap: ImageBitmap; timestampMs: number }

export type PoseResponse =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | { type: 'pose'; id: number; points: PosePoint[] | null; inferMs: number }
  | { type: 'frame-error'; id: number; message: string }

export type CryRequest =
  | { type: 'init' }
  // The samples are transferred; the worker classifies them and drops them.
  | { type: 'classify'; id: number; samples: Float32Array; sampleRate: number }

export type CryResponse =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | { type: 'scores'; id: number; windows: CryWindow[] }
  | { type: 'classify-error'; id: number; message: string }

// The tsconfig has the DOM lib, not WebWorker, so a worker's scope is typed by hand.
export type WorkerScope<Request, Response> = {
  postMessage(message: Response): void
  onmessage: ((event: MessageEvent<Request>) => void) | null
}
