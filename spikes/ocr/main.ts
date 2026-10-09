import { createInferenceClient, createInferenceWorker } from '../../src/inference/client'
import { appShell, startServiceWorker } from '../../src/lib/appShell'
import { detectPlatform, pickBackend, type Backend } from '../../src/lib/backend'
import { checkCapabilities } from '../../src/lib/capabilities'
import { ORT_WASM, PP_OCR } from '../../src/inference/ocr/models'
import { downscaleImage } from '../../src/lib/image'
import { createModelDownload } from '../../src/lib/modelDownload'
import { modelBytes } from '../../src/lib/offlineModels'
import { browserModelDownloadDeps } from '../../src/lib/useModelDownload'
import type { OcrOutput } from '../../src/inference/ocr/runtime'

// The OCR spike page (spike-ocr.html): pick or take a photo, then see the
// boxes, the text and the time each stage took. Plain and unstyled on purpose.
// Every timing shown is measured live on this device with performance.now().

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const statusEl = $('status')
const shellEl = $('shell')
const backendEl = $('backend')
const canvas = $<HTMLCanvasElement>('canvas')
const linesEl = $('lines')
const reportEl = $('report')
const inputs = [$<HTMLInputElement>('camera'), $<HTMLInputElement>('file')]
const prepareButton = $<HTMLButtonElement>('prepare')
const prepareStatus = $('prepare-status')

const SPIKE_BACKEND: Backend = {
  kind: 'wasm',
  threads: 1,
  reason: 'OCR spike: WASM only',
  threadsReason: 'Single-threaded',
}

startServiceWorker()
const showShell = () => (shellEl.textContent = `Offline app shell: ${appShell.getStatus()}`)
appShell.subscribe(showShell)
showShell()

let deviceLine = ''
void checkCapabilities().then((caps) => {
  const picked = pickBackend(caps, detectPlatform())
  deviceLine = `Device check would pick: ${picked.kind}${picked.kind === 'wasm' ? ` (${picked.threads} thread)` : ''}. ${picked.reason}.`
  backendEl.textContent = `${deviceLine} This spike always runs WASM, single-threaded.`
})

// Download the models into the model cache first ("Prepare for offline"), so
// the spike runs in airplane mode after that.
const models = [ORT_WASM, PP_OCR]
const download = createModelDownload(models, browserModelDownloadDeps)
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`
prepareButton.textContent = `Download the models (${mb(modelBytes(models))})`
download.subscribe(() => {
  const state = download.getState()
  prepareButton.hidden = state.status !== 'idle' && state.status !== 'error'
  prepareStatus.textContent =
    state.status === 'downloading'
      ? `Downloading ${mb(state.loadedBytes)} of ${mb(state.totalBytes)}`
      : state.status === 'error'
        ? `Download failed (${state.code}): ${state.message}`
        : state.status === 'ready'
          ? 'Models downloaded: works offline.'
          : state.status
})
prepareButton.addEventListener('click', () => void download.start())
const modelsReady = new Promise<void>((resolve) => {
  const check = () => download.getState().status === 'ready' && resolve()
  download.subscribe(check)
  void download.checkCached().then(check)
})

const client = createInferenceClient(createInferenceWorker())
let initMs = 0
const ready = (async () => {
  statusEl.textContent = 'Download the models to start.'
  await modelsReady
  statusEl.textContent = 'Loading the OCR models…'
  const start = performance.now()
  await client.init(SPIKE_BACKEND, {
    onProgress: (p) => (statusEl.textContent = `Loading the OCR models… ${Math.round(p * 100)}%`),
  })
  initMs = performance.now() - start
  statusEl.textContent = `Models ready in ${Math.round(initMs)} ms. Pick or take a photo.`
  inputs.forEach((input) => (input.disabled = false))
})()
ready.catch((error: unknown) => {
  statusEl.textContent = `Could not load the models: ${error instanceof Error ? error.message : String(error)}`
})

async function readPhoto(file: File) {
  inputs.forEach((input) => (input.disabled = true))
  linesEl.replaceChildren()
  statusEl.textContent = 'Reading…'
  try {
    const start = performance.now()
    const small = await downscaleImage(file, { type: 'image/png' })
    const bitmap = await createImageBitmap(small.blob)
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const decodeMs = performance.now() - start

    const result = await client.run<OcrOutput>(
      { width: pixels.width, height: pixels.height, data: pixels.data },
      { onProgress: (p) => (statusEl.textContent = `Reading… ${Math.round(p * 100)}%`) },
    )
    const totalMs = performance.now() - start

    ctx.lineWidth = Math.max(2, canvas.width / 400)
    ctx.strokeStyle = 'red'
    for (const { box } of result.lines) ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
    for (const line of result.lines) {
      const item = document.createElement('li')
      item.textContent = `${line.text}  (${line.score.toFixed(2)})`
      linesEl.append(item)
    }

    const ms = (value: number) => `${Math.round(value)} ms`
    statusEl.textContent = `Done in ${ms(totalMs)}. ${result.lines.length} lines.`
    reportEl.textContent = [
      `When: ${new Date().toISOString()}`,
      `Device: ${navigator.userAgent}`,
      `Online: ${navigator.onLine}`,
      deviceLine,
      `Image: ${small.width}x${small.height} (from ${file.size} bytes)`,
      `Model load: ${ms(initMs)}`,
      `Decode + downscale: ${ms(decodeMs)}`,
      `Detection: ${ms(result.timings.detMs)}`,
      `Recognition: ${ms(result.timings.recMs)} (${result.lines.length} lines kept)`,
      `Total for this photo: ${ms(totalMs)}`,
      'Text:',
      ...result.lines.map((line) => `  ${line.text}`),
    ].join('\n')
  } catch (error) {
    statusEl.textContent = `Failed: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    inputs.forEach((input) => {
      input.disabled = false
      input.value = ''
    })
  }
}

for (const input of inputs) {
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) void ready.then(() => readPhoto(file))
  })
}
