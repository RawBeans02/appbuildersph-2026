import { describe, expect, it, vi } from 'vitest'
import { withFirstFrameFallback, type PoseFrame, type PoseTracker } from './poseTracker'

const video = {} as HTMLVideoElement
const frame = (inferMs: number): PoseFrame => ({ points: null, inferMs })

function fake(where: PoseTracker['where'], detect: PoseTracker['detect']) {
  const dispose = vi.fn<() => void>()
  const tracker: PoseTracker = { where, fallbackReason: where === 'main-thread' ? 'fallback' : null, detect, dispose }
  return Object.assign(tracker, { dispose })
}

describe('withFirstFrameFallback', () => {
  it('switches to the main thread when the worker fails its first frame, and retries that frame there', async () => {
    const worker = fake('worker', () => Promise.reject(new Error('WebGL 2 failed')))
    const main = fake('main-thread', () => Promise.resolve(frame(7)))
    const startMain = vi.fn((reason: string) => { void reason; return Promise.resolve(main) })
    const tracker = withFirstFrameFallback(worker, startMain)
    expect(tracker.where).toBe('worker')
    await expect(tracker.detect(video, 0)).resolves.toEqual(frame(7))
    expect(startMain).toHaveBeenCalledOnce()
    expect(startMain.mock.calls[0][0]).toMatch(/could not run the pose model .*WebGL 2 failed/)
    expect(worker.dispose).toHaveBeenCalledOnce()
    expect(tracker.where).toBe('main-thread')
    await expect(tracker.detect(video, 1)).resolves.toEqual(frame(7))
    expect(startMain).toHaveBeenCalledOnce()
  })

  it('keeps the worker and passes later errors through once a frame has worked', async () => {
    let calls = 0
    const worker = fake('worker', () => (calls++ === 0 ? Promise.resolve(frame(3)) : Promise.reject(new Error('later'))))
    const startMain = vi.fn((reason: string) => { void reason; return Promise.resolve(worker) })
    const tracker = withFirstFrameFallback(worker, startMain)
    await expect(tracker.detect(video, 0)).resolves.toEqual(frame(3))
    await expect(tracker.detect(video, 1)).rejects.toThrow('later')
    expect(startMain).not.toHaveBeenCalled()
    expect(tracker.where).toBe('worker')
  })

  it('surfaces a main-thread failure after the switch instead of looping', async () => {
    const worker = fake('worker', () => Promise.reject(new Error('worker')))
    const main = fake('main-thread', () => Promise.reject(new Error('main too')))
    const tracker = withFirstFrameFallback(worker, () => Promise.resolve(main))
    await expect(tracker.detect(video, 0)).rejects.toThrow('main too')
    await expect(tracker.detect(video, 1)).rejects.toThrow('main too')
  })

  it('disposes whichever tracker is current', async () => {
    const worker = fake('worker', () => Promise.reject(new Error('x')))
    const main = fake('main-thread', () => Promise.resolve(frame(1)))
    const tracker = withFirstFrameFallback(worker, () => Promise.resolve(main))
    await tracker.detect(video, 0)
    tracker.dispose()
    expect(main.dispose).toHaveBeenCalledOnce()
  })
})
