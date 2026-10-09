import { cryDetected, cryingSeconds } from '../../inference/hinga/cry'
import { listenForCrying, startCryModel, type CryModel, type Listening } from '../../inference/hinga/cryChecker'
import { analyze, type Analysis, type Frame, type Refusal } from '../../inference/hinga/dsp'
import type { CountMethod, FrameMeasure, MethodInfo } from '../../inference/hinga/method'
import { createCountMethod } from '../../inference/hinga/poseMethod'
import type { Box } from '../../inference/hinga/roi'

// One Hinga session on the page: the camera, the per-frame measure from the
// count method, the 60 s count with a live trace, the cry check, and the
// result. Plain TypeScript; the page subscribes to its state. Frames and audio
// are processed and dropped: nothing is recorded, stored or sent.

export const COUNT_MS = 60_000
const TRACE_MS = 10_000

export type CountRefusal = Refusal | 'crying' | 'interrupted'

export type CryCheck =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'listening'; cryingSeconds: number }
  | { status: 'off'; reason: string }

export type CountOutcome =
  | { kind: 'counted'; perMin: number; analysis: Analysis; cry: CryCheck }
  | { kind: 'refused'; refusal: CountRefusal; analysis: Analysis | null; cry: CryCheck }

export type SessionState = {
  model: { status: 'loading' } | ({ status: 'ready' } & MethodInfo) | { status: 'error'; message: string }
  // Failed loads of the count method so far (open() and reloadModel()); the
  // flow shows L9b after one and L8a after two.
  loadFailures: number
  // 'blocked': the browser gave no camera (permission denied, no camera, or no
  // camera API); the reason is for the console, not the screen.
  camera: { status: 'off' } | { status: 'starting' } | { status: 'on'; settings: string } | { status: 'blocked'; reason: string }
  regionFound: boolean
  counting: { secondsLeft: number } | null
  cry: CryCheck
  outcome: CountOutcome | null
  // Measured on this device since the camera started.
  avgInferMs: number | null
  fps: number | null
}

type Count = { startMs: number; locked: Box; frames: Frame[]; listening: Listening | null }

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

// open() loads the models and close() frees everything; the page opens it on
// mount and closes it on unmount (React may do that twice in development, so
// a newer open() makes the older one's late results go away).
export function createCountSession(makeMethod: () => CountMethod = () => createCountMethod()) {
  let state: SessionState = {
    model: { status: 'loading' },
    loadFailures: 0,
    camera: { status: 'off' },
    regionFound: false,
    counting: null,
    cry: { status: 'loading' },
    outcome: null,
    avgInferMs: null,
    fps: null,
  }
  const listeners = new Set<() => void>()
  const set = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  let generation = 0
  let method: CountMethod | null = null
  let methodReady = false
  let cryModel: CryModel | null = null
  let video: HTMLVideoElement | null = null
  let overlay: HTMLCanvasElement | null = null
  let stream: MediaStream | null = null
  let raf = 0
  let busy = false
  let lastVideoTime = -1
  let lastTimestamp = 0
  let frames = 0
  let inferTotalMs = 0
  let firstFrameAt = 0
  let lastFrameAt = 0
  let last: FrameMeasure | null = null
  let count: Count | null = null
  // Model starts run one at a time (both MediaPipe runtimes use one global
  // factory while they start), including a reload while the cry model starts.
  let starting: Promise<void> = Promise.resolve()
  const oneAtATime = (job: () => Promise<void>) => (starting = starting.then(job, job))

  // Models: the count method's, then the cry check's.
  function open() {
    const opened = ++generation
    set({ loadFailures: 0, cry: { status: 'loading' } })
    document.addEventListener('visibilitychange', onVisibility)
    void loadMethod(opened)
    void oneAtATime(async () => {
      if (opened !== generation) return
      try {
        if (typeof Worker === 'undefined') throw new Error('this browser has no workers')
        const model = await startCryModel()
        if (opened !== generation) return model.dispose()
        cryModel = model
        set({ cry: { status: 'ready' } })
      } catch (error) {
        if (opened === generation) set({ cry: { status: 'off', reason: `the cry model could not load (${errorText(error)})` } })
      }
    })
  }

  function loadMethod(opened: number) {
    method?.dispose()
    const current = makeMethod()
    method = current
    methodReady = false
    set({ model: { status: 'loading' } })
    return oneAtATime(async () => {
      if (opened !== generation || method !== current) return current.dispose()
      try {
        const info = await current.start()
        if (opened !== generation || method !== current) return current.dispose()
        methodReady = true
        set({ model: { status: 'ready', ...info } })
      } catch (error) {
        if (opened === generation && method === current) methodFailed(error)
      }
    })
  }

  function methodFailed(error: unknown) {
    console.error('Hinga: the breathing check could not load', error)
    methodReady = false
    set({ model: { status: 'error', message: errorText(error) }, loadFailures: state.loadFailures + 1 })
  }

  // L9b's Try again: load the count method again (the files are cached).
  function reloadModel() {
    if (state.model.status === 'error') void loadMethod(generation)
  }

  function close() {
    generation++
    document.removeEventListener('visibilitychange', onVisibility)
    stopCamera()
    method?.dispose()
    method = null
    methodReady = false
    cryModel?.dispose()
    cryModel = null
  }

  function attach(videoElement: HTMLVideoElement | null, overlayCanvas: HTMLCanvasElement | null) {
    video = videoElement
    overlay = overlayCanvas
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream
      void video.play().catch(() => {})
    }
  }

  // withMicrophone: after 3c, ask for the camera and the microphone in one
  // browser prompt, as 3c says; the cry check opens its own microphone stream
  // during the count, so this audio track is stopped at once.
  async function startCamera(withMicrophone = false) {
    if (stream || state.camera.status === 'starting') return
    if (!navigator.mediaDevices?.getUserMedia) {
      set({ camera: { status: 'blocked', reason: 'no camera API here (it needs HTTPS and camera support)' } })
      return
    }
    const opened = generation
    set({ camera: { status: 'starting' } })
    try {
      stream = await openCamera(withMicrophone)
    } catch (error) {
      console.error('Hinga: no camera', error)
      set({ camera: { status: 'blocked', reason: error instanceof DOMException ? error.name : errorText(error) } })
      return
    }
    if (opened !== generation) return stopStream()
    if (video) {
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      await video.play().catch(() => {})
    }
    const settings = stream.getVideoTracks()[0]?.getSettings() ?? {}
    frames = 0
    inferTotalMs = 0
    firstFrameAt = 0
    set({
      camera: { status: 'on', settings: `${settings.width ?? '?'}x${settings.height ?? '?'}, ${settings.facingMode ?? 'facing not reported'}` },
    })
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(loop)
  }

  function stopStream() {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    if (video) video.srcObject = null
  }

  function stopCamera() {
    cancelCount('interrupted')
    cancelAnimationFrame(raf)
    stopStream()
    last = null
    overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height)
    // A blocked camera stays blocked (3d) until the health worker tries again.
    set({ camera: state.camera.status === 'blocked' ? state.camera : { status: 'off' }, regionFound: false })
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    if (busy || !methodReady || !method || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return
    if (video.currentTime === lastVideoTime) return
    lastVideoTime = video.currentTime
    busy = true
    const now = performance.now()
    lastTimestamp = Math.max(now, lastTimestamp + 1)
    const counting = count
    method.measure(video, lastTimestamp, counting?.locked ?? null).then(
      (measure) => {
        busy = false
        if (!stream) return
        last = measure
        frames++
        inferTotalMs += measure.inferMs
        if (!firstFrameAt) firstFrameAt = now
        lastFrameAt = now
        if (counting && count === counting) {
          counting.frames.push({ t: now, box: measure.region, signals: measure.signals })
          if (now - counting.startMs >= COUNT_MS) finishCount()
        }
        draw()
        const secondsLeft = count ? Math.max(0, Math.ceil((COUNT_MS - (now - count.startMs)) / 1000)) : null
        const patch: Partial<SessionState> = {}
        if (state.regionFound !== !!measure.region) patch.regionFound = !!measure.region
        if (count && state.counting?.secondsLeft !== secondsLeft) patch.counting = { secondsLeft: secondsLeft! }
        if (frames % 15 === 0) {
          patch.avgInferMs = inferTotalMs / frames
          patch.fps = lastFrameAt > firstFrameAt ? ((frames - 1) * 1000) / (lastFrameAt - firstFrameAt) : null
        }
        if (Object.keys(patch).length) set(patch)
      },
      (error: unknown) => {
        busy = false
        // The model broke while running: the same as a failed load (L9b, then L8a).
        stopCamera()
        method?.dispose()
        method = null
        methodFailed(error)
      },
    )
  }

  // Call from the user's tap: the microphone and its audio start from a gesture.
  async function startCount() {
    if (count || !last?.region || state.camera.status !== 'on') return
    let listening: Listening | null = null
    let cry: CryCheck = state.cry
    if (cryModel) {
      try {
        listening = await listenForCrying(cryModel, () => {
          if (count?.listening) set({ cry: { status: 'listening', cryingSeconds: cryingSeconds(count.listening.windows()) } })
        })
        cry = { status: 'listening', cryingSeconds: 0 }
      } catch (error) {
        const denied = error instanceof DOMException && error.name === 'NotAllowedError'
        cry = { status: 'off', reason: denied ? 'microphone not allowed' : `microphone unavailable (${errorText(error)})` }
      }
    }
    // The region may have moved while the microphone prompt was open.
    const region = last?.region
    if (!region || state.camera.status !== 'on') {
      listening?.stop()
      return
    }
    count = { startMs: performance.now(), locked: region, frames: [], listening }
    set({ counting: { secondsLeft: COUNT_MS / 1000 }, outcome: null, cry })
  }

  function stopListening(done: Count): CryCheck {
    if (!done.listening) return state.cry
    done.listening.stop()
    return { status: 'listening', cryingSeconds: cryingSeconds(done.listening.windows()) }
  }

  function finishCount() {
    const done = count!
    count = null
    const cry = stopListening(done)
    const crying = done.listening ? cryDetected(done.listening.windows()) : false
    const analysis = analyze(done.frames)
    const outcome: CountOutcome = crying
      ? { kind: 'refused', refusal: 'crying', analysis, cry }
      : analysis.ok
        ? { kind: 'counted', perMin: analysis.perMin, analysis, cry }
        : { kind: 'refused', refusal: analysis.refusal, analysis, cry }
    set({ counting: null, outcome, cry: cryModel ? { status: 'ready' } : state.cry })
  }

  function cancelCount(refusal: CountRefusal = 'interrupted') {
    if (!count) return
    const done = count
    count = null
    const cry = stopListening(done)
    set({ counting: null, outcome: { kind: 'refused', refusal, analysis: null, cry }, cry: cryModel ? { status: 'ready' } : state.cry })
  }

  function draw() {
    if (!overlay || !video) return
    const context = overlay.getContext('2d')
    if (!context) return
    if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
      overlay.width = video.videoWidth
      overlay.height = video.videoHeight
    }
    const w = overlay.width
    const h = overlay.height
    const line = Math.max(2, w / 320)
    context.clearRect(0, 0, w, h)
    context.lineWidth = line
    const rect = (box: Box) => context.strokeRect(box.x0 * w, box.y0 * h, (box.x1 - box.x0) * w, (box.y1 - box.y0) * h)
    if (last?.region) {
      context.strokeStyle = 'lime'
      rect(last.region)
    }
    if (count) {
      context.strokeStyle = 'deepskyblue'
      context.setLineDash([line * 3, line * 3])
      rect(count.locked)
      context.setLineDash([])
    }
    context.fillStyle = 'yellow'
    for (const point of last?.points ?? []) {
      context.beginPath()
      context.arc(point.x * w, point.y * h, line * 2, 0, 2 * Math.PI)
      context.fill()
    }
    if (count && count.frames.length > 1) {
      const now = count.frames[count.frames.length - 1].t
      const recent = count.frames.filter((frame) => now - frame.t <= TRACE_MS)
      const names = Object.keys(recent[recent.length - 1].signals)
      names.forEach((name, i) => {
        const top = h * (0.72 + (0.14 * i) / Math.max(1, names.length - 1))
        trace(context, recent.map((frame) => [frame.t, frame.signals[name] ?? NaN]), now, top, h * 0.12, w, i ? 'orange' : 'white')
      })
    }
  }

  // One signal over the last TRACE_MS, scaled to its own range.
  function trace(context: CanvasRenderingContext2D, points: [number, number][], now: number, top: number, height: number, width: number, color: string) {
    const values = points.map(([, v]) => v).filter(Number.isFinite)
    if (values.length < 2) return
    const lo = Math.min(...values)
    const span = Math.max(...values) - lo || 1
    context.strokeStyle = color
    context.beginPath()
    let started = false
    for (const [t, v] of points) {
      if (!Number.isFinite(v)) continue
      const x = width - ((now - t) / TRACE_MS) * width
      const y = top + height - ((v - lo) / span) * height
      if (started) context.lineTo(x, y)
      else context.moveTo(x, y)
      started = true
    }
    context.stroke()
  }

  function onVisibility() {
    if (document.hidden) cancelCount('interrupted')
  }

  return {
    open,
    close,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    attach,
    startCamera,
    stopCamera,
    reloadModel,
    startCount,
    // The health worker's Cancel: back to framing, no refusal to show.
    cancelCount() {
      cancelCount('interrupted')
      set({ outcome: null })
    },
    clearOutcome: () => set({ outcome: null }),
  }
}

async function openCamera(withMicrophone: boolean): Promise<MediaStream> {
  const video = { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }
  if (withMicrophone) {
    try {
      const both = await navigator.mediaDevices.getUserMedia({ video, audio: true })
      for (const track of both.getAudioTracks()) {
        track.stop()
        both.removeTrack(track)
      }
      return both
    } catch {
      // No microphone, or it was refused: the camera alone decides (the cry
      // check says it is off during the count).
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: false, video })
}

export type CountSession = ReturnType<typeof createCountSession>
