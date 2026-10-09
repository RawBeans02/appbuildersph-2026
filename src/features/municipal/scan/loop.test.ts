import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startScanLoop } from './loop'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// Frames the fake camera returns, one per decode.
function frames(...texts: (string | null)[]) {
  let i = 0
  return vi.fn(async () => texts[Math.min(i++, texts.length - 1)])
}

describe('startScanLoop', () => {
  it('decodes one frame at a time, every intervalMs after the last decode', async () => {
    const decodeFrame = frames(null)
    const stop = startScanLoop({ decodeFrame, onText: () => {}, intervalMs: 250 })
    await vi.advanceTimersByTimeAsync(0)
    expect(decodeFrame).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(249)
    expect(decodeFrame).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(decodeFrame).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(decodeFrame).toHaveBeenCalledTimes(6)
    stop()
  })

  it('never overlaps a slow decode', async () => {
    let running = 0
    let maxRunning = 0
    const decodeFrame = vi.fn(async () => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise((resolve) => setTimeout(resolve, 700))
      running--
      return null
    })
    const stop = startScanLoop({ decodeFrame, onText: () => {}, intervalMs: 250 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(maxRunning).toBe(1)
    // Each cycle is 700 ms decoding + 250 ms waiting.
    expect(decodeFrame).toHaveBeenCalledTimes(6)
    stop()
  })

  it('reports a QR held in view once, and again only after it was away for repeatAfterMs', async () => {
    const onText = vi.fn()
    let current: string | null = 'AGP1.a.b'
    const stop = startScanLoop({ decodeFrame: async () => current, onText, intervalMs: 100, repeatAfterMs: 1000 })
    await vi.advanceTimersByTimeAsync(3000) // held in view for 3 s
    expect(onText).toHaveBeenCalledTimes(1)
    current = null
    await vi.advanceTimersByTimeAsync(500) // away briefly
    current = 'AGP1.a.b'
    await vi.advanceTimersByTimeAsync(200)
    expect(onText).toHaveBeenCalledTimes(1)
    current = null
    await vi.advanceTimersByTimeAsync(1500) // away long enough
    current = 'AGP1.a.b'
    await vi.advanceTimersByTimeAsync(200)
    expect(onText).toHaveBeenCalledTimes(2)
    stop()
  })

  it('reports a different QR right away', async () => {
    const onText = vi.fn()
    const stop = startScanLoop({ decodeFrame: frames('AGP1.one', 'AGPK1.two'), onText, intervalMs: 100 })
    await vi.advanceTimersByTimeAsync(150)
    expect(onText.mock.calls).toEqual([['AGP1.one'], ['AGPK1.two']])
    stop()
  })

  it('keeps going after a decode error, and reports it', async () => {
    const onError = vi.fn()
    const onText = vi.fn()
    let calls = 0
    const decodeFrame = async () => {
      calls++
      if (calls === 1) throw new Error('frame not ready')
      return 'AGP1.x.y'
    }
    const stop = startScanLoop({ decodeFrame, onText, onError, intervalMs: 100 })
    await vi.advanceTimersByTimeAsync(150)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onText).toHaveBeenCalledWith('AGP1.x.y')
    stop()
  })

  it('stops: no more decodes, and a decode in flight reports nothing', async () => {
    const onText = vi.fn()
    const decodeFrame = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return 'AGP1.late.text'
    })
    const stop = startScanLoop({ decodeFrame, onText, intervalMs: 100 })
    stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(decodeFrame).toHaveBeenCalledTimes(1)
    expect(onText).not.toHaveBeenCalled()
  })
})
