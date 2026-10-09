import { statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MEDIAPIPE_WASM, POSE_LANDMARKER_LITE } from './offlineFiles'

// The byte sizes in offlineFiles.ts must match the real files, or the size
// check in the model cache would reject every download.
describe('Hinga spike file sizes', () => {
  it('match the pose model in public/models/', () => {
    const [file] = POSE_LANDMARKER_LITE.files
    expect(statSync(`public${file.url}`).size).toBe(file.bytes)
  })

  it('match the installed MediaPipe wasm, which copy:mediapipe serves', () => {
    expect(statSync('node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm').size).toBe(
      MEDIAPIPE_WASM.files[0].bytes,
    )
  })
})
