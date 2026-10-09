import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision'
import { appShell, startServiceWorker } from '../../lib/appShell'
import { createModelDownload } from '../../lib/modelDownload'
import { modelBytes } from '../../lib/offlineModels'
import { browserModelDownloadDeps } from '../../lib/useModelDownload'
import { analyze, type Analysis, type Frame, type Refusal } from './dsp'
import { classifyBreathing } from './imci'
import { createMetronome } from './metronome'
import { HINGA_SPIKE_FILES } from './offlineFiles'
import { loadPoseLandmarker } from './pose'
import { meanLuma, shoulderMidY, torsoBox, type Box } from './roi'

// The Hinga spike page (spike-hinga.html): rear camera, pose landmarks for the
// torso, a 60 s count, then breaths per minute or a refusal with its reason.
// Plain and unstyled on purpose. Every timing shown is measured live on this
// device with performance.now(). Frames are processed and dropped; nothing is
// stored or sent.

const COUNT_MS = 60_000
const TRACE_MS = 10_000
// The luminance is measured on a downscaled copy of each frame.
const LUMA_WIDTH = 160

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const shellEl = $('shell')
const prepareBtn = $<HTMLButtonElement>('prepare')
const prepareStatus = $('prepare-status')
const modelEl = $('model')
const statusEl = $('status')
const resultEl = $('result')
const detailsEl = $('details')
const timingsEl = $('timings')
const reportEl = $('report')
const video = $<HTMLVideoElement>('video')
const overlay = $<HTMLCanvasElement>('overlay')
const cameraBtn = $<HTMLButtonElement>('camera')
const stopBtn = $<HTMLButtonElement>('stop')
const countBtn = $<HTMLButtonElement>('count')
const cancelBtn = $<HTMLButtonElement>('cancel')
const ageInput = $<HTMLInputElement>('age')
const metroBtn = $<HTMLButtonElement>('metro')
const metroRate = $<HTMLInputElement>('metro-rate')
const metroSound = $<HTMLInputElement>('metro-sound')
const metroCue = $('metro-cue')
const metroBar = $('metro-bar')

const overlayCtx = overlay.getContext('2d')!
const lumaCanvas = document.createElement('canvas')
const lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true })!

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const ms = (value: number) => `${value.toFixed(1)} ms`

// ---------------------------------------------------------------------------
// Offline app shell and model

startServiceWorker()
const showShell = () => (shellEl.textContent = `Offline app shell: ${appShell.getStatus()}`)
appShell.subscribe(showShell)
showShell()

// Save the WebAssembly and the model on the device first, so the page works in
// airplane mode after that; the pose model then loads from that copy.
const download = createModelDownload(HINGA_SPIKE_FILES, browserModelDownloadDeps)
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`
prepareBtn.textContent = `Download for offline (${mb(modelBytes(HINGA_SPIKE_FILES))})`
function renderDownload() {
  const state = download.getState()
  prepareBtn.hidden = state.status !== 'idle' && state.status !== 'error'
  prepareStatus.textContent =
    state.status === 'downloading'
      ? `Downloading ${mb(state.loadedBytes)} of ${mb(state.totalBytes)}…`
      : state.status === 'error'
        ? `Download failed (${state.code}): ${state.message}`
        : state.status === 'ready'
          ? 'Offline files saved on this device: the page works in airplane mode.'
          : state.status === 'idle'
            ? 'Not saved for offline yet.'
            : `${state.status}…`
}
download.subscribe(renderDownload)
prepareBtn.addEventListener('click', () => void download.start())
const filesReady = new Promise<void>((resolve) => {
  const check = () => download.getState().status === 'ready' && resolve()
  download.subscribe(check)
  void download.checkCached().then(() => {
    renderDownload()
    check()
    if (download.getState().status === 'idle') {
      modelEl.textContent = 'Tap "Download for offline" (online) to load the pose model.'
    }
  })
})

let landmarker: PoseLandmarker | null = null
let modelLoadMs = 0

const modelReady = (async () => {
  await filesReady
  modelEl.textContent = 'Loading the pose model…'
  const start = performance.now()
  landmarker = await loadPoseLandmarker()
  modelLoadMs = performance.now() - start
  modelEl.textContent = `Pose model ready (loaded in ${Math.round(modelLoadMs)} ms, measured on this device).`
  updateButtons()
  showTimings()
})()
modelReady.catch((error: unknown) => {
  modelEl.textContent = `Could not load the pose model: ${errorText(error)}. Reload the page to try again.`
})

// ---------------------------------------------------------------------------
// Camera and the frame loop

let stream: MediaStream | null = null
let cameraLine = ''
let raf = 0
let lastVideoTime = -1
let lastTimestamp = 0
// Since the camera started:
let frameCount = 0
let inferTotalMs = 0
let firstFrameAt = 0
let lastFrameAt = 0

let currentBox: Box | null = null
let currentLandmarks: NormalizedLandmark[] | undefined

type Count = { startMs: number; lockedBox: Box; frames: Frame[]; inferTotalMs: number; metronome: string }
let count: Count | null = null

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    statusEl.textContent = 'This browser cannot open the camera here (it needs HTTPS and camera support).'
    return
  }
  cameraBtn.disabled = true
  statusEl.textContent = 'Opening the camera…'
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
    })
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    statusEl.textContent =
      name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow the camera for this site in the browser settings, then tap Start camera again.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'No camera found on this device.'
          : `Could not open the camera: ${errorText(error)}`
    cameraBtn.disabled = false
    return
  }
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  try {
    await video.play()
  } catch (error) {
    statusEl.textContent = `The camera opened but the video did not start: ${errorText(error)}`
  }
  const settings = stream.getVideoTracks()[0]?.getSettings() ?? {}
  cameraLine = `${settings.width ?? video.videoWidth}x${settings.height ?? video.videoHeight}, facing ${settings.facingMode ?? 'not reported'}, ${settings.frameRate ? `${Math.round(settings.frameRate)} fps offered` : 'frame rate not reported'}`
  frameCount = 0
  inferTotalMs = 0
  firstFrameAt = 0
  statusEl.textContent = 'Camera on. Frame the head, shoulders and chest, then start the count.'
  updateButtons()
  raf = requestAnimationFrame(tick)
}

function stopCamera() {
  cancelCount('Count cancelled: the camera was stopped.')
  cancelAnimationFrame(raf)
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  video.srcObject = null
  currentBox = null
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height)
  statusEl.textContent = 'Camera off.'
  updateButtons()
}

function tick() {
  try {
    processFrame()
  } catch (error) {
    stopCamera()
    statusEl.textContent = `Pose detection failed: ${errorText(error)}`
    return
  }
  raf = requestAnimationFrame(tick)
}

function processFrame() {
  if (!landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return
  if (video.currentTime === lastVideoTime) return
  lastVideoTime = video.currentTime
  sizeCanvases()

  const now = performance.now()
  // detectForVideo needs strictly increasing timestamps.
  lastTimestamp = Math.max(now, lastTimestamp + 1)
  const start = performance.now()
  const result = landmarker.detectForVideo(video, lastTimestamp)
  const inferMs = performance.now() - start

  frameCount++
  inferTotalMs += inferMs
  if (!firstFrameAt) firstFrameAt = now
  lastFrameAt = now
  currentLandmarks = result.landmarks[0]
  currentBox = torsoBox(currentLandmarks)

  if (count) {
    lumaCtx.drawImage(video, 0, 0, lumaCanvas.width, lumaCanvas.height)
    const pixels = lumaCtx.getImageData(0, 0, lumaCanvas.width, lumaCanvas.height)
    count.inferTotalMs += inferMs
    count.frames.push({
      t: now,
      box: currentBox,
      luma: meanLuma(pixels.data, pixels.width, pixels.height, count.lockedBox),
      shoulderY: currentBox && currentLandmarks ? shoulderMidY(currentLandmarks) : null,
    })
    const left = Math.ceil((COUNT_MS - (now - count.startMs)) / 1000)
    statusEl.textContent = `Counting… ${Math.max(0, left)} s left. Torso ${currentBox ? 'found' : 'NOT found'} this frame.`
    if (now - count.startMs >= COUNT_MS) finishCount()
  } else {
    statusEl.textContent = currentBox
      ? 'Torso found. Hold still and start the count.'
      : 'No torso found. Show the head, shoulders and chest.'
  }
  updateButtons()
  draw()
  if (frameCount % 15 === 0) showTimings()
}

function sizeCanvases() {
  if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
    overlay.width = video.videoWidth
    overlay.height = video.videoHeight
  }
  const lumaHeight = Math.max(1, Math.round((LUMA_WIDTH * video.videoHeight) / video.videoWidth))
  if (lumaCanvas.width !== LUMA_WIDTH || lumaCanvas.height !== lumaHeight) {
    lumaCanvas.width = LUMA_WIDTH
    lumaCanvas.height = lumaHeight
  }
}

// ---------------------------------------------------------------------------
// Overlay: torso box, locked region, shoulders and a live trace

function draw() {
  const w = overlay.width
  const h = overlay.height
  const line = Math.max(2, w / 320)
  overlayCtx.clearRect(0, 0, w, h)
  overlayCtx.lineWidth = line
  const rect = (box: Box) => overlayCtx.strokeRect(box.x0 * w, box.y0 * h, (box.x1 - box.x0) * w, (box.y1 - box.y0) * h)
  if (currentBox) {
    overlayCtx.strokeStyle = 'lime'
    rect(currentBox)
  }
  if (count) {
    overlayCtx.strokeStyle = 'deepskyblue'
    overlayCtx.setLineDash([line * 3, line * 3])
    rect(count.lockedBox)
    overlayCtx.setLineDash([])
  }
  if (currentLandmarks && currentBox) {
    overlayCtx.fillStyle = 'yellow'
    for (const i of [11, 12]) {
      const p = currentLandmarks[i]
      overlayCtx.beginPath()
      overlayCtx.arc(p.x * w, p.y * h, line * 2, 0, 2 * Math.PI)
      overlayCtx.fill()
    }
  }
  if (count && count.frames.length > 1) {
    const now = count.frames[count.frames.length - 1].t
    const recent = count.frames.filter((f) => now - f.t <= TRACE_MS)
    trace(recent.map((f) => [f.t, f.luma]), now, h * 0.72, h * 0.12, 'white')
    trace(recent.map((f) => [f.t, f.shoulderY ?? NaN]), now, h * 0.86, h * 0.12, 'orange')
  }
}

// One signal as a line over the last TRACE_MS, scaled to its own range.
function trace(points: [number, number][], now: number, top: number, height: number, color: string) {
  const values = points.map(([, v]) => v).filter(Number.isFinite)
  if (values.length < 2) return
  const lo = Math.min(...values)
  const span = Math.max(...values) - lo || 1
  const w = overlay.width
  overlayCtx.strokeStyle = color
  overlayCtx.beginPath()
  let started = false
  for (const [t, v] of points) {
    if (!Number.isFinite(v)) continue
    const x = w - ((now - t) / TRACE_MS) * w
    const y = top + height - ((v - lo) / span) * height
    if (started) overlayCtx.lineTo(x, y)
    else overlayCtx.moveTo(x, y)
    started = true
  }
  overlayCtx.stroke()
}

// ---------------------------------------------------------------------------
// The 60 s count and the result

function startCount() {
  if (!currentBox) {
    statusEl.textContent = 'No torso found. Show the head, shoulders and chest, then try again.'
    return
  }
  count = {
    startMs: performance.now(),
    lockedBox: currentBox,
    frames: [],
    inferTotalMs: 0,
    metronome: metronome.isRunning() ? `on, ${metroRate.value}/min, sound ${metroSound.checked ? 'on' : 'off'}` : 'off',
  }
  resultEl.textContent = 'Counting…'
  detailsEl.replaceChildren()
  updateButtons()
}

function cancelCount(message: string) {
  if (!count) return
  count = null
  resultEl.textContent = message
  updateButtons()
}

const REFUSALS: Record<Refusal, string> = {
  'too-few-frames': "Couldn't get a steady reading: the camera gave too few frames or paused. Keep this page open and in front for the whole minute.",
  'no-torso': "Couldn't find the chest for long enough. Keep the head, shoulders and chest in view.",
  motion: 'Too much movement. Hold the phone still (or rest it on something) and wait until the child is calm.',
  'no-rhythm': "Couldn't get a steady reading: no clear breathing rhythm.",
  disagree: "Couldn't get a steady reading: the two ways of counting disagree.",
}

function finishCount() {
  const done = count!
  count = null
  const analysis = analyze(done.frames)
  console.info(`[hinga] signal used: ${analysis.chosen?.name ?? 'none (refused before the signal step)'}`, analysis)

  // An empty field is no age, not 0 months.
  const age = ageInput.value.trim() === '' ? Number.NaN : Number(ageInput.value)
  let resultLine: string
  if (analysis.ok) {
    const c = classifyBreathing(analysis.perMin, age)
    const verdict =
      c.kind === 'fast'
        ? `Fast breathing for age: refer (cut-off ${c.cutoff}/min or more at ${age} months)`
        : c.kind === 'not-fast'
          ? `Not fast breathing for age (cut-off ${c.cutoff}/min at ${age} months)`
          : 'No classification: enter an age under 60 months (the IMCI cut-offs cover children under 5)'
    resultLine = `${analysis.perMin} breaths per minute. ${verdict}.`
  } else {
    resultLine = `No count. ${REFUSALS[analysis.refusal]}`
  }
  resultEl.textContent = resultLine

  const lines = detailLines(analysis)
  detailsEl.replaceChildren(
    ...lines.map((text) => {
      const item = document.createElement('li')
      item.textContent = text
      return item
    }),
  )
  const avgInfer = done.frames.length ? done.inferTotalMs / done.frames.length : 0
  showTimings()
  reportEl.textContent = [
    `When: ${new Date().toISOString()}`,
    `Device: ${navigator.userAgent}`,
    `Online: ${navigator.onLine}`,
    `Offline app shell: ${appShell.getStatus()}`,
    `Camera: ${cameraLine}`,
    `Model load: ${Math.round(modelLoadMs)} ms`,
    `Pose inference during the count: ${ms(avgInfer)} per frame on average, ${done.frames.length} frames`,
    `Effective frame rate during the count: ${analysis.gate.fps.toFixed(1)} fps`,
    `Age entered: ${ageInput.value} months; metronome ${done.metronome}`,
    `Result: ${resultLine}`,
    ...lines,
  ].join('\n')
  updateButtons()
}

function detailLines(analysis: Analysis): string[] {
  const g = analysis.gate
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  return [
    `Signal used: ${analysis.chosen ? (analysis.chosen.name === 'luma' ? 'chest brightness (luma)' : 'shoulder height') : 'none'}`,
    ...analysis.signals.map(
      (s) =>
        `${s.name}: spectral peak ${s.fftPerMin.toFixed(1)}/min, zero crossings ${s.zcPerMin.toFixed(1)}/min, prominence ${s.prominence.toFixed(2)}, 30 s windows ${s.windowPeaksPerMin.map((v) => v.toFixed(1)).join(' ')}`,
    ),
    `Quality gate: ${g.durationS.toFixed(1)} s, ${g.fps.toFixed(1)} fps, longest gap ${Math.round(g.maxGapMs)} ms, torso lost ${pct(g.lostFraction)}, moved ${pct(g.movedFraction)} (largest shift ${pct(g.maxShift)} of the box)`,
  ]
}

function showTimings() {
  const items: string[] = []
  if (modelLoadMs) items.push(`Model load: ${Math.round(modelLoadMs)} ms (WebAssembly start-up and model, from the copy saved on this device)`)
  if (frameCount) {
    const seconds = (lastFrameAt - firstFrameAt) / 1000
    items.push(`Pose inference: ${ms(inferTotalMs / frameCount)} per frame on average over ${frameCount} frames`)
    if (seconds > 0) items.push(`Effective frame rate: ${((frameCount - 1) / seconds).toFixed(1)} fps (frames processed per second)`)
  }
  if (cameraLine) items.push(`Camera: ${cameraLine}`)
  if (!items.length) items.push('Nothing measured yet.')
  items.push('All measured live on this device.')
  timingsEl.replaceChildren(
    ...items.map((text) => {
      const item = document.createElement('li')
      item.textContent = text
      return item
    }),
  )
}

function updateButtons() {
  stopBtn.disabled = !stream
  cameraBtn.disabled = !!stream
  countBtn.disabled = !stream || !landmarker || !!count || !currentBox
  cancelBtn.disabled = !count
}

// ---------------------------------------------------------------------------
// Metronome

let lastCue = ''
const metronome = createMetronome((phase) => {
  const level = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase)
  metroBar.style.width = `${(level * 100).toFixed(1)}%`
  const cue = phase < 0.5 ? 'Breathe in' : 'Breathe out'
  if (cue !== lastCue) metroCue.textContent = lastCue = cue
})

metroBtn.addEventListener('click', () => {
  if (metronome.isRunning()) {
    metronome.stop()
    metroBtn.textContent = 'Start metronome'
    metroCue.textContent = lastCue = 'Metronome off'
    metroBar.style.width = '0'
    return
  }
  const rate = Number(metroRate.value)
  if (!Number.isFinite(rate) || rate < 6 || rate > 100) {
    metroCue.textContent = 'Enter 6 to 100 breaths per minute.'
    return
  }
  metroBtn.textContent = 'Stop metronome'
  metronome.start(rate, metroSound.checked).catch((error: unknown) => {
    metroCue.textContent = `Metronome sound failed: ${errorText(error)}`
  })
})

// ---------------------------------------------------------------------------

cameraBtn.addEventListener('click', () => void startCamera())
stopBtn.addEventListener('click', stopCamera)
countBtn.addEventListener('click', startCount)
cancelBtn.addEventListener('click', () => cancelCount('Count cancelled.'))
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelCount('Count cancelled: the page was hidden during the count.')
})
window.addEventListener('pagehide', () => stream?.getTracks().forEach((track) => track.stop()))
