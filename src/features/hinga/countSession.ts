import { cryingSeconds, cryVerdict } from '../../inference/hinga/cry'
import { listenForCrying, startCryModel, type CryModel, type Listening } from '../../inference/hinga/cryChecker'
import { analyze, detrend, type Analysis, type Frame, type Refusal } from '../../inference/hinga/dsp'
import type { CountMethod, FrameMeasure, MethodInfo } from '../../inference/hinga/method'
import { createCountMethod } from '../../inference/hinga/poseMethod'
import type { Box } from '../../inference/hinga/roi'

// One Hinga session on the page: the camera, the per-frame measure from the
// count method, the 60 s count with a live trace, the cry check, and the
// result. Plain TypeScript; the page subscribes to its state. Frames and audio
// are processed and dropped: nothing is recorded, stored or sent.

export const COUNT_MS = 60_000
const TRACE_MS = 10_000
// How often the countdown and the end of the minute are checked, so the count
// ends on time even if the camera stops sending frames.
const TICK_MS = 250

export type CountRefusal = Refusal | 'crying' | 'interrupted'

// The cry check right now ('off' with a plain reason for the screen).
export type CryCheck =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'listening'; cryingSeconds: number }
  | { status: 'off'; reason: string }

// cryOff: why the cry check couldn't vouch for this count, shown with the
// result as "Cry check off: …"; null when it listened to the whole minute.
export type CountOutcome =
  | { kind: 'counted'; perMin: number; analysis: Analysis; cryOff: string | null; at: string }
  | { kind: 'refused'; refusal: CountRefusal; analysis: Analysis | null; cryOff: string | null }

export type SessionState = {
  model: { status: 'loading' } | ({ status: 'ready' } & MethodInfo) | { status: 'error'; message: string }
  // Failed loads of the count method so far (open() and reloadModel()); the
  // flow shows L9b after one and L8a after two.
  loadFailures: number
  // 'blocked': the browser gave no camera (permission denied, no camera, or no
  // camera API); the reason is for the console, not the screen.
  camera: { status: 'off' } | { status: 'starting' } | { status: 'on' } | { status: 'blocked'; reason: string }
  regionFound: boolean
  // True from the Start tap until the count starts (the microphone opening).
  startingCount: boolean
  counting: { secondsLeft: number } | null
  cry: CryCheck
  outcome: CountOutcome | null
  // Refusals since the last count that worked (or resetRefusals()).
  refusalsInRow: number
}

type Count = {
  startMs: number
  locked: Box
  frames: Frame[]
  listening: Listening | null
  // Why the cry check isn't listening, when it isn't.
  cryOffReason: string | null
}

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
    startingCount: false,
    counting: null,
    cry: { status: 'loading' },
    outcome: null,
    refusalsInRow: 0,
  }
  const listeners = new Set<() => void>()
  const set = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  let generation = 0
  // Bumped by stopCamera(), so a camera that opens after the health worker
  // left (Back while the browser was still opening it) is closed at once.
  let cameraRequest = 0
  let method: CountMethod | null = null
  let methodReady = false
  let cryModel: CryModel | null = null
  let video: HTMLVideoElement | null = null
  let traceCanvas: HTMLCanvasElement | null = null
  let stream: MediaStream | null = null
  let raf = 0
  let tick = 0
  let busy = false
  let lastVideoTime = -1
  let lastTimestamp = 0
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
        console.error('Hinga: the cry check could not load', error)
        if (opened === generation) set({ cry: { status: 'off', reason: "the cry check couldn't start" } })
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
        console.info(`Hinga: the torso finder runs ${info.where === 'worker' ? 'in a background worker' : 'on the page'}`, info)
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

  // The camera's <video>, and the canvas the 4a trace is drawn on (its CSS
  // color is the line's color).
  function attach(videoElement: HTMLVideoElement | null, trace: HTMLCanvasElement | null) {
    video = videoElement
    traceCanvas = trace
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
    const request = ++cameraRequest
    set({ camera: { status: 'starting' } })
    let opening: MediaStream
    try {
      opening = await openCamera(withMicrophone)
    } catch (error) {
      console.error('Hinga: no camera', error)
      if (opened === generation && request === cameraRequest) {
        set({ camera: { status: 'blocked', reason: error instanceof DOMException ? error.name : errorText(error) } })
      }
      return
    }
    if (opened !== generation || request !== cameraRequest) {
      opening.getTracks().forEach((track) => track.stop())
      return
    }
    stream = opening
    if (video) {
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      await video.play().catch(() => {})
    }
    set({ camera: { status: 'on' } })
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(loop)
  }

  function stopStream() {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    if (video) video.srcObject = null
  }

  function stopCamera() {
    cameraRequest++
    cancelCount('interrupted')
    cancelAnimationFrame(raf)
    stopStream()
    last = null
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
        if (counting && count === counting && now - counting.startMs < COUNT_MS) {
          counting.frames.push({ t: now, box: measure.region, signals: measure.signals })
          drawTrace(counting)
        }
        if (state.regionFound !== !!measure.region) set({ regionFound: !!measure.region })
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

  // Call from the user's tap: the microphone and its audio start from a
  // gesture. A second tap while the microphone opens does nothing.
  async function startCount() {
    if (count || state.startingCount || !last?.region || state.camera.status !== 'on') return
    set({ startingCount: true })
    let listening: Listening | null = null
    let cryOffReason: string | null = null
    try {
      if (cryModel) {
        try {
          listening = await listenForCrying(cryModel, () => {
            if (count?.listening) set({ cry: { status: 'listening', cryingSeconds: cryingSeconds(count.listening.windows()) } })
          })
        } catch (error) {
          console.error('Hinga: no microphone for the cry check', error)
          const name = error instanceof DOMException ? error.name : ''
          cryOffReason =
            name === 'NotAllowedError' ? 'microphone not allowed' : name === 'NotFoundError' ? 'no microphone' : "the microphone didn't open"
        }
      } else {
        cryOffReason = state.cry.status === 'off' ? state.cry.reason : 'it was still loading when the count started'
      }
      // The camera may have stopped, the region moved, or a count started while
      // the microphone prompt was open.
      const region = last?.region
      if (count || !region || state.camera.status !== 'on') {
        listening?.stop()
        return
      }
      count = { startMs: performance.now(), locked: region, frames: [], listening, cryOffReason }
      clearInterval(tick)
      tick = window.setInterval(onTick, TICK_MS)
      set({
        counting: { secondsLeft: COUNT_MS / 1000 },
        outcome: null,
        cry: listening ? { status: 'listening', cryingSeconds: 0 } : state.cry,
      })
    } finally {
      set({ startingCount: false })
    }
  }

  // The countdown, and the end of the minute whether or not frames arrive.
  function onTick() {
    if (!count) return
    const elapsed = performance.now() - count.startMs
    if (elapsed >= COUNT_MS) return finishCount()
    const secondsLeft = Math.ceil((COUNT_MS - elapsed) / 1000)
    if (state.counting?.secondsLeft !== secondsLeft) set({ counting: { secondsLeft } })
  }

  function endCount(): Count | null {
    const done = count
    count = null
    clearInterval(tick)
    done?.listening?.stop()
    clearTrace()
    return done
  }

  const cryAfterCount = () => (cryModel ? { status: 'ready' as const } : state.cry)

  // A camera that stopped sending frames gives a short recording, which the
  // quality gate refuses ('too-few-frames').
  function finishCount() {
    const done = endCount()
    if (!done) return
    const cry = cryVerdict({
      offReason: done.cryOffReason,
      windows: done.listening?.windows() ?? [],
      failed: done.listening?.failed() ?? 0,
    })
    const analysis = analyze(done.frames)
    const outcome: CountOutcome = cry.crying
      ? { kind: 'refused', refusal: 'crying', analysis, cryOff: null }
      : analysis.ok
        ? { kind: 'counted', perMin: analysis.perMin, analysis, cryOff: cry.off, at: new Date().toISOString() }
        : { kind: 'refused', refusal: analysis.refusal, analysis, cryOff: cry.off }
    const refusalsInRow = outcome.kind === 'counted' ? 0 : state.refusalsInRow + 1
    set({ counting: null, outcome, cry: cryAfterCount(), refusalsInRow })
  }

  function cancelCount(refusal: CountRefusal = 'interrupted') {
    const done = endCount()
    if (!done) return
    set({ counting: null, outcome: { kind: 'refused', refusal, analysis: null, cryOff: done.cryOffReason }, cry: cryAfterCount() })
  }

  // The last TRACE_MS of the first signal with values, its linear trend
  // removed, scaled to its own range: the live trace on 4a. No count is shown.
  function drawTrace(counting: Count) {
    const canvas = traceCanvas
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = window.devicePixelRatio || 1
    const width = Math.round(canvas.clientWidth * ratio)
    const height = Math.round(canvas.clientHeight * ratio)
    if (!width || !height) return
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    context.clearRect(0, 0, width, height)
    const now = counting.frames[counting.frames.length - 1].t
    const recent = counting.frames.filter((frame) => now - frame.t <= TRACE_MS)
    const names = Object.keys(recent[recent.length - 1].signals)
    const pick = names
      .map((name) => recent.flatMap((frame) => (Number.isFinite(frame.signals[name]) ? [[frame.t, frame.signals[name]!] as const] : [])))
      .find((points) => points.length > 2)
    if (!pick) return
    const flat = detrend(Float64Array.from(pick, ([, v]) => v))
    let lo = Infinity
    let hi = -Infinity
    for (const v of flat) {
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    const span = hi - lo || 1
    const pad = height * 0.15
    context.strokeStyle = getComputedStyle(canvas).color
    context.lineWidth = 3 * ratio
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.beginPath()
    pick.forEach(([t], i) => {
      const x = width - ((now - t) / TRACE_MS) * width
      const y = height - pad - ((flat[i] - lo) / span) * (height - 2 * pad)
      if (i) context.lineTo(x, y)
      else context.moveTo(x, y)
    })
    context.stroke()
  }

  function clearTrace() {
    traceCanvas?.getContext('2d')?.clearRect(0, 0, traceCanvas.width, traceCanvas.height)
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
    // A new child starts a new run of attempts.
    resetRefusals: () => set({ refusalsInRow: 0 }),
  }
}

export type CountSession = ReturnType<typeof createCountSession>

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
      // check says it is off with the result).
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: false, video })
}
