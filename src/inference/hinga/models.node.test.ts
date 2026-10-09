import { statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AUDIO_RUNTIME, CRY_MODEL, POSE_MODEL, VISION_RUNTIME } from './models'

// The byte sizes in models.ts must match the real files, or the size check in
// the model cache would reject every download.
describe('Hinga file sizes', () => {
  it('match the models in public/models/', () => {
    for (const file of [...POSE_MODEL.files, ...CRY_MODEL.files]) {
      expect(statSync(`public${file.url}`).size, file.url).toBe(file.bytes)
    }
  })

  it('match the installed MediaPipe runtimes that copy-mediapipe.mjs serves', () => {
    const sources = {
      'vision_wasm_module_internal.mjs': '@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js',
      'vision_wasm_module_internal.wasm': '@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.wasm',
      'audio_wasm_module_internal.mjs': '@mediapipe/tasks-audio/wasm/audio_wasm_module_internal.js',
      'audio_wasm_module_internal.wasm': '@mediapipe/tasks-audio/wasm/audio_wasm_module_internal.wasm',
    } as Record<string, string>
    for (const file of [...VISION_RUNTIME.files, ...AUDIO_RUNTIME.files]) {
      const name = file.url.split('/').pop()!
      expect(statSync(`node_modules/${sources[name]}`).size, name).toBe(file.bytes)
    }
  })
})
