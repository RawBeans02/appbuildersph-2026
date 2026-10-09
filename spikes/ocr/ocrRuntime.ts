import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import type { Runtime } from '../../src/inference/protocol'
import { buildCharset } from './ctc'
import type { RGBAImage } from './imageOps'
import { runOcr, type OcrLine, type OcrModels, type OcrTimings } from './pipeline'

// PP-OCRv5 mobile on onnxruntime-web, inside the spike's worker. WASM only and
// single-threaded whatever the device check picks: no WebGPU (iPhone), and no
// threads without cross-origin isolation. The plain wasm build keeps the
// WebGPU/JSEP code out of the bundle. Model files are self-hosted under
// /models/ppocr/ and precached by the service worker, so this works offline.

export type OcrInput = { width: number; height: number; data: Uint8ClampedArray }
export type OcrOutput = { lines: OcrLine[]; timings: OcrTimings }

const MODEL_DIR = '/models/ppocr/'

async function fetchOk(file: string): Promise<Response> {
  const response = await fetch(MODEL_DIR + file)
  if (!response.ok) throw new Error(`Could not load ${file}: HTTP ${response.status}`)
  return response
}

function isOcrInput(value: unknown): value is OcrInput {
  const input = value as Partial<OcrInput> | null
  return (
    !!input &&
    Number.isInteger(input.width) &&
    Number.isInteger(input.height) &&
    input.data instanceof Uint8ClampedArray &&
    input.data.length === (input.width ?? 0) * (input.height ?? 0) * 4
  )
}

export function createOcrRuntime(): Runtime<OcrInput, OcrOutput> {
  let models: OcrModels | null = null
  let charset: string[] = []

  return {
    async init(_backend, onProgress) {
      ort.env.wasm.numThreads = 1
      ort.env.wasm.proxy = false
      ort.env.wasm.wasmPaths = { wasm: wasmUrl }

      const [det, rec, dictionary] = await Promise.all([
        fetchOk('det.onnx').then((r) => r.arrayBuffer()),
        fetchOk('rec-en.onnx').then((r) => r.arrayBuffer()),
        fetchOk('dict-en.txt').then((r) => r.text()),
      ])
      onProgress(0.4)
      const options: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }
      const detSession = await ort.InferenceSession.create(new Uint8Array(det), options)
      onProgress(0.7)
      const recSession = await ort.InferenceSession.create(new Uint8Array(rec), options)
      charset = buildCharset(dictionary)

      models = {
        async detect(tensor, width, height) {
          const input = new ort.Tensor('float32', tensor, [1, 3, height, width])
          const output = await detSession.run({ [detSession.inputNames[0]]: input })
          return output[detSession.outputNames[0]].data as Float32Array
        },
        async recognize(tensor, width) {
          const input = new ort.Tensor('float32', tensor, [1, 3, 48, width])
          const output = await recSession.run({ [recSession.inputNames[0]]: input })
          const result = output[recSession.outputNames[0]]
          const [, steps, classes] = result.dims
          return { data: result.data as Float32Array, steps, classes }
        },
      }
      onProgress(1)
    },

    async run(input, { signal, onProgress }) {
      if (!models) throw new Error('The OCR models are not loaded.')
      if (!isOcrInput(input)) throw new Error('Expected { width, height, data: Uint8ClampedArray } RGBA pixels.')
      const image: RGBAImage = input
      return runOcr(image, models, charset, { signal, onProgress })
    },
  }
}
