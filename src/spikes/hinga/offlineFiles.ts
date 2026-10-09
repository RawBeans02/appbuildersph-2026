import type { OfflineModel } from '../../lib/offlineModels'

// The Hinga spike's large files, saved into the model cache by the page's
// "Download for offline" button; the service worker then serves them offline.
// Not named models.ts on purpose: the app's "Prepare for offline" step collects
// every src/**/models.ts, and this throwaway spike's files don't belong there.
// The loader script (vision_wasm_internal.js) is small and precached with the app shell.
// Sizes are exact; offlineFiles.node.test.ts checks them against the files.

export const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe/wasm`
export const MODEL_URL = `${import.meta.env.BASE_URL}models/mediapipe/pose_landmarker_lite.task`

export const MEDIAPIPE_WASM: OfflineModel = {
  id: 'mediapipe-tasks-vision-wasm',
  version: '1.0.1',
  label: 'MediaPipe Tasks Vision (WebAssembly, SIMD build)',
  device: 'phone',
  files: [{ url: `${WASM_BASE}/vision_wasm_internal.wasm`, bytes: 11_756_954 }],
}

export const POSE_LANDMARKER_LITE: OfflineModel = {
  id: 'pose-landmarker-lite',
  version: 'float16-1',
  label: 'MediaPipe Pose Landmarker lite',
  device: 'phone',
  files: [{ url: MODEL_URL, bytes: 5_777_746 }],
}

export const HINGA_SPIKE_FILES = [MEDIAPIPE_WASM, POSE_LANDMARKER_LITE]
