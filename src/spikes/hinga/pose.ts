import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { MODEL_URL, WASM_BASE } from './offlineFiles'

// Everything is self-hosted, never a CDN: `npm run copy:mediapipe` (run before
// dev and build) copies the WebAssembly from node_modules into
// public/mediapipe/wasm/, and the model is committed in public/models/mediapipe/.
// Offline, the service worker serves both from the model cache (offlineFiles.ts).
// Only the SIMD build is copied; a browser without WebAssembly SIMD gets a
// clear error here instead of a missing file.
export async function loadPoseLandmarker(): Promise<PoseLandmarker> {
  if (!(await FilesetResolver.isSimdSupported())) {
    throw new Error('this browser has no WebAssembly SIMD, which the pose model needs')
  }
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  return PoseLandmarker.createFromOptions(fileset, {
    // CPU only: no GPU delegate on phones for now (see TASKS.md, platform notes).
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
    outputSegmentationMasks: false,
  })
}
