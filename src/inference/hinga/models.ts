import type { OfflineModel } from '../../lib/offlineModels'

// Hinga's files, downloaded by "Prepare for offline" (src/lib/offlineModels.ts
// finds this file). The runtimes are copied from node_modules into
// public/models/mediapipe-runtime/ by scripts/copy-mediapipe.mjs; the models are
// committed in public/models/mediapipe/.
// The worker reads every file straight from the model cache (mediapipe.ts), so
// offline inference doesn't depend on the service worker seeing its requests.
// Sizes are exact; models.node.test.ts checks them against the files.

const base = import.meta.env.BASE_URL

export const VISION_RUNTIME: OfflineModel = {
  id: 'mediapipe-tasks-vision-module',
  version: '1.0.1',
  label: 'MediaPipe Tasks Vision runtime (WebAssembly)',
  device: 'phone',
  files: [
    { url: `${base}models/mediapipe-runtime/vision_wasm_module_internal.mjs`, bytes: 323_415 },
    { url: `${base}models/mediapipe-runtime/vision_wasm_module_internal.wasm`, bytes: 11_756_972 },
  ],
}

export const POSE_MODEL: OfflineModel = {
  id: 'pose-landmarker-lite',
  version: 'float16-1',
  label: 'Hinga torso finder (MediaPipe Pose Landmarker lite)',
  device: 'phone',
  files: [{ url: `${base}models/mediapipe/pose_landmarker_lite.task`, bytes: 5_777_746 }],
}

export const AUDIO_RUNTIME: OfflineModel = {
  id: 'mediapipe-tasks-audio-module',
  version: '1.0.1',
  label: 'MediaPipe Tasks Audio runtime (WebAssembly)',
  device: 'phone',
  files: [
    { url: `${base}models/mediapipe-runtime/audio_wasm_module_internal.mjs`, bytes: 252_719 },
    { url: `${base}models/mediapipe-runtime/audio_wasm_module_internal.wasm`, bytes: 6_580_784 },
  ],
}

export const CRY_MODEL: OfflineModel = {
  id: 'yamnet',
  version: 'float32-1',
  label: 'Hinga cry check (YAMNet)',
  device: 'phone',
  files: [{ url: `${base}models/mediapipe/yamnet.tflite`, bytes: 4_126_810 }],
}

export const models: OfflineModel[] = [VISION_RUNTIME, POSE_MODEL, AUDIO_RUNTIME, CRY_MODEL]
