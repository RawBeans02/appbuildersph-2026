import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCharset } from './ctc'
import { runOcr, type OcrModels } from './pipeline'

// Runs the real PP-OCRv5 models (public/models/ppocr/) on a synthetic label,
// with onnxruntime-web's Node build. CI only: the build laptop doesn't run models.

function readPpm(path: string) {
  const file = readFileSync(path)
  const header = file.subarray(0, 32).toString('latin1').match(/^P6\s+(\d+)\s+(\d+)\s+255\s/)
  if (!header) throw new Error('Not a binary 8-bit PPM')
  const [, width, height] = header.map(Number)
  const rgb = file.subarray(header[0].length)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4)
  return { data, width, height }
}

describe.skipIf(!process.env.CI)('PP-OCRv5 on a synthetic medicine label (CI only)', () => {
  it('reads the lot and expiry lines', { timeout: 120_000 }, async () => {
    const ort = await import('onnxruntime-web')
    ort.env.wasm.numThreads = 1
    const load = (file: string) => readFileSync(`public/models/ppocr/${file}`)
    const det = await ort.InferenceSession.create(load('det.onnx'))
    const rec = await ort.InferenceSession.create(load('rec-en.onnx'))
    const charset = buildCharset(load('dict-en.txt').toString('utf8'))

    const models: OcrModels = {
      async detect(tensor, width, height) {
        const out = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, height, width]) })
        return out[det.outputNames[0]].data as Float32Array
      },
      async recognize(tensor, width) {
        const out = await rec.run({ [rec.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, 48, width]) })
        const result = out[rec.outputNames[0]]
        return { data: result.data as Float32Array, steps: result.dims[1], classes: result.dims[2] }
      },
    }

    const { lines, timings } = await runOcr(readPpm('spikes/ocr/fixtures/label.ppm'), models, charset)
    const text = lines.map((line) => line.text)
    console.log('OCR lines:', text, 'timings (CI runner, ms):', timings)

    const joined = text.join('\n').replace(/ /g, '')
    expect(lines.length).toBeGreaterThanOrEqual(3)
    expect(joined).toContain('A23B456')
    expect(joined).toContain('06/2027')
  })
})
