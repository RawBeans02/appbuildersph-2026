import { useEffect, useRef, useState } from 'react'
import { deriveKey, PBKDF2_ITERATIONS } from '../../data/db/vault'
import { DEMO_SCAN_LABEL } from '../../data/seed/demoLabel'
import { startCryModel } from '../../inference/hinga/cryChecker'
import { startPoseTracker } from '../../inference/hinga/poseTracker'
import { OCR_ENGINE, OCR_ENGINE_LABEL } from '../../inference/ocr/engine'
import { isReaderLoaded, readBox, warmUpReader } from '../../inference/ocr/ocrClient'
import { detectPlatform, pickBackend, type Backend } from '../../lib/backend'
import { checkCapabilities } from '../../lib/capabilities'
import { parseLabel } from '../../rules/label'
import { EMPTY_MEASUREMENTS, median, TABLE_HEADER, tableRow, type Measurements } from './measure'

// "Measure this device": times the on-device AI on THIS device, after Prepare
// for offline, for the numbers we quote (method: docs/MEASUREMENTS.md).
// Plain on purpose.

const DEMO_LABEL_URL = '/demo/label-doxy-24A.png'
const WARM_READS = 3
const FPS_SECONDS = 10
// The PIN key timing uses a fixed test PIN and a fresh random salt: the cost
// is the same for any PIN, and nothing real is derived.
const PIN_KEY_TEST_PIN = '0000'
const PIN_KEY_LABEL = `PIN key (PBKDF2, ${PBKDF2_ITERATIONS.toLocaleString('en-US')} iterations)`

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function describeBackend(backend: Backend): string {
  if (backend.kind === 'webgpu') return `WebGPU${backend.f16 ? ' (f16)' : ''}`
  if (backend.kind === 'wasm') return `WASM, ${backend.threads} thread${backend.threads === 1 ? '' : 's'}`
  return 'none'
}

const show = (value: number | null, unit = 'ms') => (value === null ? '–' : `${Math.round(value)} ${unit}`)

export function MeasureDevice() {
  const [deviceName, setDeviceName] = useState('')
  const [backend, setBackend] = useState('checking…')
  const [results, setResults] = useState(EMPTY_MEASUREMENTS)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [row, setRow] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    void checkCapabilities().then((caps) => setBackend(describeBackend(pickBackend(caps, detectPlatform()))))
  }, [])

  // usesModels: the failure may just be models not downloaded yet.
  async function run(name: string, task: () => Promise<void>, usesModels = true) {
    setBusy(name)
    setMessage(null)
    try {
      await task()
    } catch (error) {
      const hint = usesModels ? " If the models aren't downloaded yet, prepare for offline first." : ''
      setMessage(`${name}: ${errorText(error)}.${hint}`)
    } finally {
      setBusy(null)
    }
  }

  const measureReader = () =>
    run('Box reader', async () => {
      const wasLoaded = isReaderLoaded()
      const loadStart = performance.now()
      await warmUpReader()
      const loadMs = wasLoaded ? null : performance.now() - loadStart
      const photo = await (await fetch(DEMO_LABEL_URL)).blob()
      const times: number[] = []
      let correct = true
      for (let i = 0; i <= WARM_READS; i++) {
        const start = performance.now()
        const reading = parseLabel(await readBox(photo))
        times.push(performance.now() - start)
        correct &&= reading.lot?.value === DEMO_SCAN_LABEL.lot && reading.expiry?.value === DEMO_SCAN_LABEL.expiry
      }
      setResults((current) => ({
        ...current,
        ocrLoadMs: loadMs,
        ocrFirstReadMs: times[0],
        ocrWarmReadMs: median(times.slice(1)),
        ocrReadCorrect: correct,
      }))
    })

  const measurePoseStart = () =>
    run('Pose model', async () => {
      let start = performance.now()
      const first = await startPoseTracker()
      const coldMs = performance.now() - start
      first.dispose()
      start = performance.now()
      const second = await startPoseTracker()
      const warmMs = performance.now() - start
      second.dispose()
      setResults((current) => ({
        ...current,
        poseColdMs: coldMs,
        poseWarmMs: warmMs,
        poseWhere: second.where === 'worker' ? 'worker' : `main thread (${second.fallbackReason ?? 'chosen'})`,
      }))
    })

  const measureFps = () =>
    run('Camera frames per second', async () => {
      const video = videoRef.current
      if (!video) throw new Error('no video element')
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      const tracker = await startPoseTracker()
      try {
        video.srcObject = stream
        await video.play()
        const infer: number[] = []
        let frames = 0
        const start = performance.now()
        while (performance.now() - start < FPS_SECONDS * 1000) {
          const frame = await tracker.detect(video, performance.now())
          infer.push(frame.inferMs)
          frames += 1
          await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        const seconds = (performance.now() - start) / 1000
        setResults((current) => ({ ...current, poseFps: frames / seconds, poseInferMedianMs: median(infer) }))
      } finally {
        stream.getTracks().forEach((track) => track.stop())
        video.srcObject = null
        tracker.dispose()
      }
    })

  const measureCry = () =>
    run('Cry check', async () => {
      const start = performance.now()
      const model = await startCryModel()
      const startMs = performance.now() - start
      model.dispose()
      setResults((current) => ({ ...current, cryStartMs: startMs }))
    })

  // One key derivation, as unlocking (and each wrong-PIN guess) costs here.
  const measurePinKey = () =>
    run('PIN key', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const start = performance.now()
      await deriveKey(PIN_KEY_TEST_PIN, salt, PBKDF2_ITERATIONS)
      const keyMs = performance.now() - start
      setResults((current) => ({ ...current, pinKeyMs: keyMs }))
    }, false)

  async function copyRow() {
    const measurements: Measurements = {
      ...results,
      deviceName: deviceName.trim(),
      userAgent: navigator.userAgent,
      backend,
      ocrEngine: OCR_ENGINE_LABEL[OCR_ENGINE],
    }
    const text = tableRow(measurements, new Date())
    setRow(text)
    try {
      await navigator.clipboard.writeText(text)
      setMessage('Copied. Paste it into the results table in docs/MEASUREMENTS.md.')
    } catch {
      setMessage('Copying is blocked here: select the row below and copy it by hand.')
    }
  }

  return (
    <section aria-labelledby="measure">
      <h2 id="measure">Measure this device</h2>
      <p>
        Times the on-device AI here, after "Prepare for offline". Airplane mode is fine. The method and the results
        table are in docs/MEASUREMENTS.md.
      </p>
      <p>
        <label>
          Device name (the browser can't tell){' '}
          <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="iPhone 14 Pro Max" />
        </label>
      </p>
      <p>
        Backend the device check picks: {backend}. Box reader: {OCR_ENGINE_LABEL[OCR_ENGINE]}.
      </p>
      <p>
        <button type="button" disabled={busy !== null} onClick={() => void measureReader()}>
          Measure the box reader
        </button>{' '}
        <button type="button" disabled={busy !== null} onClick={() => void measurePoseStart()}>
          Measure the pose model start
        </button>{' '}
        <button type="button" disabled={busy !== null} onClick={() => void measureFps()}>
          Measure camera frames per second ({FPS_SECONDS} s)
        </button>{' '}
        <button type="button" disabled={busy !== null} onClick={() => void measureCry()}>
          Measure the cry check start
        </button>{' '}
        <button type="button" disabled={busy !== null} onClick={() => void measurePinKey()}>
          Measure the PIN key
        </button>
      </p>
      {busy && <p role="status">Measuring: {busy}…</p>}
      <video ref={videoRef} playsInline muted style={{ maxWidth: 240 }} />
      <dl>
        <dt>Box reader: first load on this page</dt>
        <dd>{results.ocrLoadMs === null && results.ocrFirstReadMs !== null ? 'already loaded (reload the page for a cold load)' : show(results.ocrLoadMs)}</dd>
        <dt>Box reader: first read of the demo label</dt>
        <dd>{show(results.ocrFirstReadMs)}</dd>
        <dt>Box reader: later reads ({WARM_READS}, median)</dt>
        <dd>{show(results.ocrWarmReadMs)}</dd>
        <dt>Demo label read right (lot and expiry)</dt>
        <dd>{results.ocrReadCorrect === null ? '–' : results.ocrReadCorrect ? 'yes' : 'no'}</dd>
        <dt>Pose model start: first, then second</dt>
        <dd>
          {show(results.poseColdMs)}, {show(results.poseWarmMs)}
          {results.poseWhere ? ` (${results.poseWhere})` : ''}
        </dd>
        <dt>Camera frames per second with the pose model ({FPS_SECONDS} s)</dt>
        <dd>
          {results.poseFps === null ? '–' : results.poseFps.toFixed(1)}
          {results.poseInferMedianMs !== null ? `, ${Math.round(results.poseInferMedianMs)} ms per frame (median)` : ''}
        </dd>
        <dt>Cry check start</dt>
        <dd>{show(results.cryStartMs)}</dd>
        <dt>{PIN_KEY_LABEL}</dt>
        <dd>{show(results.pinKeyMs)}</dd>
      </dl>
      <p>
        <button type="button" onClick={() => void copyRow()}>
          Copy as a table row
        </button>
      </p>
      {message && <p role="status">{message}</p>}
      {row && (
        <p>
          <label>
            Table row (header in docs/MEASUREMENTS.md)
            <br />
            <textarea readOnly value={row} rows={4} style={{ width: '100%' }} aria-describedby="measure-header" />
          </label>
          <span id="measure-header" hidden>
            {TABLE_HEADER}
          </span>
        </p>
      )}
    </section>
  )
}
