import { useEffect, useState, type FormEvent } from 'react'
import { Link } from '../../app/Link'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery } from '../../data/db/useDbQuery'
import { readBox } from '../../inference/ocr/ocrClient'
import { CHECK_BELOW, parseLabel, type LabelField, type LabelReading } from '../../rules/label'
import { draftFromReading, saveStockLot, UNITS, validateDraft, type StockDraft } from './stock'

// Screens 10-12: scan a medicine box, review what was read, confirm. The box
// is read on this phone; the photo is never stored. Plain until design/ lands.
// NEEDS DESIGN: screens 10-12.

const readStock = (db: AgapayDb) => db.stockLots.list({ limit: 500 })

type Step =
  | { name: 'list' }
  | { name: 'reading'; photoUrl: string }
  | { name: 'review'; photoUrl: string | null; reading: LabelReading | null; lines: string[]; ms: number | null }

const EMPTY_DRAFT: StockDraft = { drug: '', strength: '', lot: '', expiry: '', quantity: 0, unit: 'capsule' }

function CheckNote({ field }: { field: LabelField | null | undefined }) {
  if (field === undefined) return null
  if (!field) return <> (not read: please type it)</>
  return field.confidence < CHECK_BELOW ? <> (check this: read with low confidence)</> : null
}

export default function StockPage() {
  const stock = useDbQuery(['stockLots'], readStock)
  const [step, setStep] = useState<Step>({ name: 'list' })
  const [draft, setDraft] = useState<StockDraft>(EMPTY_DRAFT)
  const [problems, setProblems] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const photoUrl = step.name === 'list' ? null : step.photoUrl
  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl])

  async function onPhoto(file: File) {
    setError(null)
    const url = URL.createObjectURL(file)
    setStep({ name: 'reading', photoUrl: url })
    try {
      const start = performance.now()
      const lines = await readBox(file)
      const reading = parseLabel(lines)
      setDraft(draftFromReading(reading))
      setProblems([])
      setStep({
        name: 'review',
        photoUrl: url,
        reading,
        lines: lines.map((line) => line.text),
        ms: performance.now() - start,
      })
    } catch (cause) {
      setStep({ name: 'list' })
      setError(
        `Could not read the box: ${cause instanceof Error ? cause.message : String(cause)}. If the reader isn't downloaded yet, prepare it for offline first.`,
      )
    }
  }

  function addManually() {
    setDraft(EMPTY_DRAFT)
    setProblems([])
    setStep({ name: 'review', photoUrl: null, reading: null, lines: [], ms: null })
  }

  async function onConfirm(event: FormEvent) {
    event.preventDefault()
    if (step.name !== 'review') return
    const found = validateDraft(draft)
    setProblems(found)
    if (found.length) return
    await saveStockLot(await getDb(), draft, step.reading)
    setStep({ name: 'list' })
  }

  const set = <K extends keyof StockDraft>(key: K, value: StockDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  if (step.name === 'reading') {
    return (
      <>
        <h1>Reading the box…</h1>
        <img src={step.photoUrl} alt="The box you photographed" style={{ maxWidth: '100%' }} />
        <p role="status">Reading on this phone…</p>
      </>
    )
  }

  if (step.name === 'review') {
    const r = step.reading
    return (
      <>
        <h1>{r ? 'Check what was read' : 'Add stock by hand'}</h1>
        {step.photoUrl && <img src={step.photoUrl} alt="The box you photographed" style={{ maxWidth: '100%' }} />}
        {step.ms !== null && <p>Read on this phone in {(step.ms / 1000).toFixed(1)} s. Correct anything that's wrong.</p>}
        <form onSubmit={(event) => void onConfirm(event)}>
          <p>
            <label>
              Medicine <input value={draft.drug} onChange={(e) => set('drug', e.target.value)} required />
            </label>
            <CheckNote field={r ? r.drug : undefined} />
          </p>
          <p>
            <label>
              Strength <input value={draft.strength} onChange={(e) => set('strength', e.target.value)} />
            </label>
          </p>
          <p>
            <label>
              Lot number <input value={draft.lot} onChange={(e) => set('lot', e.target.value)} required />
            </label>
            <CheckNote field={r ? r.lot : undefined} />
          </p>
          <p>
            <label>
              Expiry <input type="month" value={draft.expiry} onChange={(e) => set('expiry', e.target.value)} required />
            </label>
            <CheckNote field={r ? r.expiry : undefined} />
          </p>
          <p>
            <label>
              How many on hand{' '}
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={draft.quantity || ''}
                onChange={(e) => set('quantity', Number(e.target.value))}
                required
              />
            </label>{' '}
            <label>
              Unit{' '}
              <select value={draft.unit} onChange={(e) => set('unit', e.target.value)}>
                {UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
          </p>
          {problems.length > 0 && (
            <ul role="alert">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          <button type="submit">Confirm and save</button>{' '}
          <button type="button" onClick={() => setStep({ name: 'list' })}>
            Cancel
          </button>
        </form>
        {step.lines.length > 0 && (
          <details>
            <summary>All text read from the box</summary>
            <ul>
              {step.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </>
    )
  }

  return (
    <>
      <h1>Medicine stock</h1>
      <p>
        <label>
          Scan a medicine box{' '}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void onPhoto(file)
            }}
          />
        </label>
      </p>
      <p>
        <button type="button" onClick={addManually}>
          Add by hand
        </button>
      </p>
      {error && (
        <p role="alert">
          {error} <Link to="/prepare">Prepare for offline</Link>
        </p>
      )}
      <h2>On hand</h2>
      {stock.status === 'loading' ? (
        <p>Loading…</p>
      ) : stock.status === 'error' ? (
        <p role="alert">Could not read the stock records on this phone.</p>
      ) : stock.data.length === 0 ? (
        <p>No stock recorded yet. Scan a box to add one.</p>
      ) : (
        <ul>
          {[...stock.data]
            .sort((a, b) => a.expiry.localeCompare(b.expiry))
            .map((lot) => (
              <li key={lot.id}>
                {lot.drug} {lot.strength}, lot {lot.lot}, expires {lot.expiry}: {lot.quantity} {lot.unit}
                {lot.quantity === 1 ? '' : 's'}
                {lot.sample ? ' (sample data)' : ''}
              </li>
            ))}
        </ul>
      )}
    </>
  )
}
