import { statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ORT_WASM, PP_OCR } from './models'

// The byte sizes in models.ts must match the real files, or the size check in
// the model cache would reject every download.
describe('OCR model sizes', () => {
  it('match the files in public/models/', () => {
    for (const file of PP_OCR.files) {
      expect(statSync(`public${file.url}`).size, file.url).toBe(file.bytes)
    }
  })

  it('match the installed ONNX Runtime wasm', () => {
    expect(statSync('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm').size).toBe(ORT_WASM.files[0].bytes)
  })
})
