import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useQrScanner, type ScannerState } from './useQrScanner'

// Screen 16's scanner, plain until design/ lands. NEEDS DESIGN.
// The camera, plus two fallbacks: a photo of the QR, or its text pasted.

const ENGINE_TEXT = {
  'barcode-detector': "the browser's built-in QR reader",
  jsqr: 'the QR reader bundled with Agapay (jsQR)',
} as const

function statusText(state: ScannerState): string {
  switch (state.status) {
    case 'idle':
      return 'Camera off.'
    case 'starting':
      return 'Starting the camera…'
    case 'scanning':
      return `Scanning with ${ENGINE_TEXT[state.engine]}. Hold the phone's QR code in front of the camera.`
    case 'denied':
      return 'Camera permission was denied. Allow the camera for this site in the browser, then press Start camera again, or use a photo or the QR text below.'
    case 'no-camera':
      return 'No camera found. Use a photo of the QR code or paste its text below.'
    case 'unsupported':
      return "This browser can't use the camera on this page (it needs HTTPS). Use a photo of the QR code or paste its text below."
    case 'error':
      return `The camera could not start: ${state.message} Try again, or use a photo or the QR text below.`
  }
}

export function QrScanner({ onText }: { onText: (text: string) => void }) {
  const { state, videoRef, start, stop, decodeFile } = useQrScanner(onText)
  const [pasted, setPasted] = useState('')
  const [photoProblem, setPhotoProblem] = useState<string | null>(null)
  const scanning = state.status === 'scanning'

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPhotoProblem(null)
    try {
      const text = await decodeFile(file)
      if (text) onText(text)
      else setPhotoProblem('No QR code found in that photo. Try a sharper, closer photo.')
    } catch {
      setPhotoProblem('That file could not be opened as a photo.')
    }
  }

  function onPaste(event: FormEvent) {
    event.preventDefault()
    if (pasted.trim()) onText(pasted.trim())
    setPasted('')
  }

  return (
    <section aria-labelledby="scanner-heading">
      <h2 id="scanner-heading">Scan a QR code</h2>
      {scanning ? (
        <button type="button" onClick={stop}>
          Stop camera
        </button>
      ) : (
        <button type="button" onClick={() => void start()} disabled={state.status === 'starting'}>
          Start camera
        </button>
      )}
      <p role="status">{statusText(state)}</p>
      <video ref={videoRef} muted playsInline width={480} hidden={!scanning && state.status !== 'starting'} aria-label="Camera preview" />

      <details>
        <summary>No camera? Use a photo or the QR text</summary>
        <p>
          <label>
            Photo of a QR code <input type="file" accept="image/*" onChange={(event) => void onPhoto(event)} />
          </label>
        </p>
        {photoProblem && <p role="alert">{photoProblem}</p>}
        <form onSubmit={onPaste}>
          <p>
            <label>
              QR text (starts with AGP1. or AGPK1.)
              <br />
              <textarea value={pasted} onChange={(event) => setPasted(event.target.value)} rows={3} cols={60} />
            </label>
          </p>
          <button type="submit" disabled={!pasted.trim()}>
            Check this QR text
          </button>
        </form>
      </details>
    </section>
  )
}
