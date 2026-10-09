import { describe, expect, it, vi } from 'vitest'
import { buildCharset } from './ctc'
import { runOcr, type OcrModels } from './pipeline'

const charset = buildCharset('L\nO\nT\nE\nX\nP\n')

function image(width: number, height: number) {
  return { data: new Uint8ClampedArray(width * height * 4).fill(255), width, height }
}

// Detection finds one line in the middle; recognition always reads "LOT".
function fakeModels(): OcrModels & { detect: ReturnType<typeof vi.fn>; recognize: ReturnType<typeof vi.fn> } {
  return {
    detect: vi.fn(async (_tensor: Float32Array, width: number, height: number) => {
      const map = new Float32Array(width * height)
      for (let y = Math.floor(height * 0.4); y < Math.floor(height * 0.6); y++) {
        for (let x = Math.floor(width * 0.2); x < Math.floor(width * 0.8); x++) map[y * width + x] = 0.9
      }
      return map
    }),
    recognize: vi.fn(async () => {
      const classes = charset.length
      const data = new Float32Array(3 * classes)
      ;[1, 2, 3].forEach((c, t) => (data[t * classes + c] = 0.95))
      return { data, steps: 3, classes }
    }),
  }
}

describe('runOcr', () => {
  it('detects, crops and recognizes each line, with stage timings', async () => {
    const models = fakeModels()
    let clock = 0
    const now = () => (clock += 10)
    const result = await runOcr(image(1280, 960), models, charset, { now })
    expect(models.detect).toHaveBeenCalledWith(expect.any(Float32Array), 960, 736)
    expect(models.recognize).toHaveBeenCalledOnce()
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toMatchObject({ text: 'LOT', score: expect.closeTo(0.95, 5) })
    expect(result.lines[0].box.x0).toBeLessThan(1280 * 0.2)
    expect(result.timings).toEqual({ detMs: 10, recMs: 10 })
  })

  it('drops lines scoring under 0.5', async () => {
    const models = fakeModels()
    models.recognize.mockImplementation(async () => {
      const classes = charset.length
      const data = new Float32Array(classes)
      data[1] = 0.3
      return { data, steps: 1, classes }
    })
    expect((await runOcr(image(200, 100), models, charset)).lines).toEqual([])
  })

  it('stops between stages when aborted', async () => {
    const controller = new AbortController()
    const models = fakeModels()
    models.detect.mockImplementation(async (_t: Float32Array, width: number, height: number) => {
      controller.abort()
      return new Float32Array(width * height)
    })
    await expect(runOcr(image(200, 100), models, charset, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
