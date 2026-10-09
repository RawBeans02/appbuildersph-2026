import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildCharset } from '../../inference/ocr/ctc'
import { runOcr, type OcrModels } from '../../inference/ocr/pipeline'
import { parseLabel } from '../../rules/label'
import { DEMO_SCAN_LABEL } from './demoLabel'

// The demo's synthetic doxycycline label (docs/demo/label-doxy-24A.png) through
// the app's own OCR and label parser. The model part runs in CI only: the
// build laptop doesn't run models. This checks the clean image, not a phone
// photo of it.

const LABEL = 'docs/demo/label-doxy-24A.png'

// A minimal PNG reader for the label: 8-bit gray or RGB, not interlaced.
function readPng(path: string) {
  const file = readFileSync(path)
  if (file.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Not a PNG')
  let width = 0
  let height = 0
  let channels = 0
  const chunks: Buffer[] = []
  for (let offset = 8; offset < file.length; ) {
    const length = file.readUInt32BE(offset)
    const type = file.toString('latin1', offset + 4, offset + 8)
    const body = file.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const [bitDepth, colorType, , , interlace] = body.subarray(8, 13)
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 0 && colorType !== 2)) {
        throw new Error('Only 8-bit, non-interlaced gray or RGB PNGs')
      }
      channels = colorType === 2 ? 3 : 1
    } else if (type === 'IDAT') {
      chunks.push(body)
    }
    offset += length + 12
  }

  // Undo each row's filter (PNG spec: None, Sub, Up, Average, Paeth).
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const pixels = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0
      let predictor = 0
      if (filter === 1) predictor = a
      else if (filter === 2) predictor = b
      else if (filter === 3) predictor = (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      pixels[y * stride + x] = raw[y * (stride + 1) + 1 + x] + predictor
    }
  }

  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const rgb = channels === 3 ? pixels.subarray(i * 3, i * 3 + 3) : [pixels[i], pixels[i], pixels[i]]
    data.set([rgb[0], rgb[1], rgb[2], 255], i * 4)
  }
  return { data, width, height }
}

const gray = (image: ReturnType<typeof readPng>, x: number, y: number) => image.data[(y * image.width + x) * 4]

describe('the demo label image', () => {
  it('is a 1200x760 black-on-white label with a border and rules', () => {
    const image = readPng(LABEL)
    expect([image.width, image.height]).toEqual([1200, 760])
    expect(gray(image, 14, 380)).toBe(0) // the border
    expect(gray(image, 600, 112)).toBe(0) // the rule under the top warning
    expect(gray(image, 1100, 600)).toBe(255) // blank margin
    // Decoded exactly as Pillow reads it: the sum of all gray values.
    let sum = 0
    for (let i = 0; i < image.data.length; i += 4) sum += image.data[i]
    expect(sum).toBe(213_516_660)
  })
})

describe.skipIf(!process.env.CI)('PP-OCRv5 on the demo label (CI only)', () => {
  it('reads the drug, strength, lot and expiry the demo expects', { timeout: 120_000 }, async () => {
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

    const { lines, timings } = await runOcr(readPng(LABEL), models, charset)
    const reading = parseLabel(lines)
    console.log(
      'Demo label OCR lines:',
      lines.map((line) => `${line.text} (${line.score.toFixed(3)})`),
      'fields:',
      reading,
      'timings (CI runner, ms):',
      timings,
    )

    expect(reading.drug?.value).toBe(DEMO_SCAN_LABEL.drug)
    expect(reading.strength?.value).toBe(DEMO_SCAN_LABEL.strength)
    expect(reading.lot?.value).toBe(DEMO_SCAN_LABEL.lot)
    expect(reading.expiry?.value).toBe(DEMO_SCAN_LABEL.expiry)
  })
})
