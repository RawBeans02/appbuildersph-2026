import { CalendarBlankIcon, CaretDownIcon, CheckIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Button, Field, FlowTopBar, RecordsError, useToast, type FieldTag } from '../../components'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import type { LineFrame } from '../../inference/ocr/ocrClient'
import { useHoldReload } from '../../lib/useHoldReload'
import type { LabelReading } from '../../rules/label'
import styles from './Review.module.css'
import screen from './screen.module.css'
import {
  draftErrors,
  draftFromReading,
  lotName,
  MAX_QUANTITY,
  readTag,
  readTimeText,
  saveStockLot,
  unitPlural,
  UNITS,
  type DraftErrors,
  type StockDraft,
} from './stock'

// Screen 11a (the AI result review, L11): every field read from the box is
// shown with how sure the reader was, and is editable; the quantity is always
// typed. Nothing is saved until Confirm. Without a scan, the same form is
// "Add stock by hand".

export type ScanResult = {
  reading: LabelReading
  // Every line the reader found, for "All text read from the box".
  lines: string[]
  // Where each of those lines is on the photo (same order; a field's
  // reading.*.line indexes both), for drawing the reader's boxes over it.
  frames: LineFrame[]
  // Measured on this phone: the reading, and the reader load before it.
  readMs: number
  loadMs: number | null
}

const EMPTY_DRAFT: StockDraft = { drug: '', strength: '', lot: '', expiry: '', quantity: 0, unit: 'capsule' }

const HELPERS: Partial<Record<FieldTag, string>> = {
  check: 'Read with low confidence. Compare it with the box.',
  'not-read': "The phone couldn't find it. Please type it.",
}

// The unit select shares the field's look, but not the quantity's error border.
const baseInputClass = (className: string) => className.split(' ')[0]

export function ReviewScreen({
  scan,
  photoUrl,
  onBack,
  onScanAgain,
  onSaved,
}: {
  // null: typed in by hand.
  scan: ScanResult | null
  photoUrl: string | null
  onBack: () => void
  onScanAgain: () => void
  onSaved: () => void
}) {
  // What is typed or marked here isn't saved yet: a new version waits.
  useHoldReload()
  const [draft, setDraft] = useState<StockDraft>(() => (scan ? draftFromReading(scan.reading) : EMPTY_DRAFT))
  const [quantityText, setQuantityText] = useState('')
  const [errors, setErrors] = useState<DraftErrors>({})
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const savingRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const toast = useToast()

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  function set<K extends keyof StockDraft>(key: K, value: StockDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => (key in current ? { ...current, [key]: undefined } : current))
  }

  async function save() {
    // Guards a double tap: the second one comes before the button disables.
    if (savingRef.current) return
    const found = draftErrors(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    savingRef.current = true
    setSaving(true)
    setSaveFailed(false)
    try {
      const saved = await saveStockLot(await getDb(), draft, scan?.reading ?? null)
      toast({ message: `Saved: ${lotName(saved)}, lot ${saved.lot}.` })
      onSaved()
    } catch (error) {
      console.error('The lot was not saved:', error)
      savingRef.current = false
      setSaving(false)
      setSaveFailed(true)
    }
  }

  const reading = scan?.reading
  const tags = reading
    ? { drug: readTag(reading.drug), strength: readTag(reading.strength), lot: readTag(reading.lot), expiry: readTag(reading.expiry) }
    : null

  return (
    <form
      ref={formRef}
      className={screen.page}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <FlowTopBar onBack={onBack} />
      <div className={cx(screen.content, styles.content)}>
        {scan && (
          <div className={styles.readInfo}>
            {photoUrl && <img src={photoUrl} alt="The box you photographed" className={styles.thumb} />}
            <p className={styles.readText}>
              <span className={styles.line}>{readTimeText(scan.readMs, scan.loadMs)}</span>
              <span className={styles.line}>The photo is deleted when you leave.</span>
            </p>
          </div>
        )}
        <h1 ref={headingRef} tabIndex={-1} className={cx(screen.title, scan ? styles.title : styles.titleFirst)}>
          {scan ? 'Check what was read' : 'Add stock by hand'}
        </h1>
        {scan && <p className={styles.sub}>Fix anything that's wrong. Nothing is saved until you confirm.</p>}

        <div className={styles.fields}>
          <Field label="Medicine" tag={tags?.drug} helper={tags && HELPERS[tags.drug]} error={errors.drug}>
            {(input) => (
              <input {...input} value={draft.drug} autoComplete="off" onChange={(event) => set('drug', event.target.value)} />
            )}
          </Field>
          <Field label="Strength" tag={tags?.strength} helper={tags && HELPERS[tags.strength]}>
            {(input) => (
              <input
                {...input}
                value={draft.strength}
                autoComplete="off"
                onChange={(event) => set('strength', event.target.value)}
              />
            )}
          </Field>
          <Field label="Lot number" tag={tags?.lot} helper={tags && HELPERS[tags.lot]} error={errors.lot}>
            {(input) => (
              <input
                {...input}
                className={cx(input.className, styles.mono)}
                value={draft.lot}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(event) => set('lot', event.target.value)}
              />
            )}
          </Field>
          <Field label="Expiry" tag={tags?.expiry} helper={tags && HELPERS[tags.expiry]} error={errors.expiry}>
            {(input) => (
              <span className={styles.withIcon}>
                <input
                  {...input}
                  type="month"
                  className={cx(input.className, styles.month)}
                  value={draft.expiry}
                  onChange={(event) => set('expiry', event.target.value)}
                />
                <CalendarBlankIcon size={22} weight="bold" aria-hidden className={styles.fieldIcon} />
              </span>
            )}
          </Field>
          <Field
            label="How many on hand"
            helper="Count what is in the box. The phone doesn't guess this."
            error={errors.quantity}
          >
            {(input) => (
              <span className={styles.quantity}>
                <input
                  {...input}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_QUANTITY}
                  step={1}
                  className={cx(input.className, styles.number)}
                  value={quantityText}
                  onChange={(event) => {
                    setQuantityText(event.target.value)
                    set('quantity', event.target.value.trim() === '' ? 0 : Number(event.target.value))
                  }}
                />
                <span className={styles.withIcon}>
                  <select
                    aria-label="Unit"
                    className={cx(baseInputClass(input.className), styles.select)}
                    value={draft.unit}
                    onChange={(event) => set('unit', event.target.value)}
                  >
                    {UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unitPlural(unit)}
                      </option>
                    ))}
                  </select>
                  <CaretDownIcon size={20} weight="bold" aria-hidden className={styles.fieldIcon} />
                </span>
              </span>
            )}
          </Field>
        </div>

        {saveFailed && (
          <div className={styles.saveError}>
            <RecordsError onRetry={() => void save()} />
          </div>
        )}

        {scan && scan.lines.length > 0 && (
          <details className={styles.disclosure}>
            <summary className={styles.summary}>
              All text read from the box
              <CaretDownIcon size={20} weight="bold" aria-hidden className={styles.caret} />
            </summary>
            <ul className={styles.lines}>
              {scan.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className={cx(screen.footer, screen.footerLine)}>
        <Button type="submit" tagalog="Kumpirmahin" icon={<CheckIcon size={22} weight="bold" aria-hidden />} disabled={saving}>
          Confirm
        </Button>
        {scan && (
          <div className={screen.footerLink}>
            <Button variant="text" onClick={onScanAgain}>
              Scan again
            </Button>
          </div>
        )}
      </div>
    </form>
  )
}
