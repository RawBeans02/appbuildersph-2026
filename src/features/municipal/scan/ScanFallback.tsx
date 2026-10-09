import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Button, Field } from '../../../components'
import styles from './ScanFallback.module.css'

// When the webcam can't be used: a photo of the QR, or its text pasted.
// NEEDS DESIGN (TASKS.md B5-UI): the camera-less fallback.

export function ScanFallback({
  onText,
  decodeFile,
}: {
  onText: (text: string) => void
  decodeFile: (file: Blob) => Promise<string | null>
}) {
  const [pasted, setPasted] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProblem(null)
    try {
      const text = await decodeFile(file)
      if (text) onText(text)
      else setProblem('No QR code found in that photo. Try a sharper, closer photo.')
    } catch {
      setProblem('That file could not be opened as a photo.')
    }
  }

  function onPaste(event: FormEvent) {
    event.preventDefault()
    if (pasted.trim()) onText(pasted.trim())
    setPasted('')
  }

  return (
    <details className={styles.fallback}>
      <summary className={styles.summary}>No camera? Use a photo or the QR text</summary>
      <div className={styles.body}>
        <Field label="Photo of a QR code" error={problem}>
          {(input) => <input {...input} type="file" accept="image/*" onChange={(event) => void onPhoto(event)} />}
        </Field>
        <form onSubmit={onPaste} className={styles.paste}>
          <Field label="QR text (starts with AGP1. or AGPK1.)">
            {(input) => <textarea {...input} value={pasted} onChange={(event) => setPasted(event.target.value)} rows={3} />}
          </Field>
          <div className={styles.button}>
            <Button type="submit" variant="secondary" disabled={!pasted.trim()}>
              Check this QR text
            </Button>
          </div>
        </form>
      </div>
    </details>
  )
}
