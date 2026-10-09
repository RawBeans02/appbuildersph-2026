import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import type { OfflineModel } from '../../lib/offlineModels'

// The medicine-box reader's files, downloaded by "Prepare for offline".
// Sizes are exact; models.node.test.ts checks them against the files.

export const ORT_WASM: OfflineModel = {
  id: 'onnxruntime-web-wasm',
  version: '1.30.0',
  label: 'ONNX Runtime Web (WebAssembly)',
  device: 'phone',
  files: [{ url: ortWasmUrl, bytes: 14_239_897 }],
}

export const PP_OCR: OfflineModel = {
  id: 'pp-ocrv5-mobile-en',
  version: '1',
  label: 'Medicine-box reader (PP-OCRv5 mobile, English)',
  device: 'phone',
  files: [
    { url: '/models/ppocr/det.onnx', bytes: 4_826_518 },
    { url: '/models/ppocr/rec-en.onnx', bytes: 7_830_888 },
    { url: '/models/ppocr/dict-en.txt', bytes: 1_416 },
  ],
}

export const models: OfflineModel[] = [ORT_WASM, PP_OCR]
