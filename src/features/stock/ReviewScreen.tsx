import { CalendarBlankIcon, CaretDownIcon, CheckIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Button, Field, FlowTopBar, RecordsError, useToast, type FieldTag } from '../../components'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import { OCR_ENGINE, type OcrEngine } from '../../inference/ocr/engine'
import type { LineFrame } from '../../inference/ocr/ocrClient'
import { useHoldReload } from '../../lib/useHoldReload'
import type { LabelReading } from '../../rules/label'
import { LineBoxes, NumberTag } from './LineBoxes'
import {
  fieldLines,
  fieldNumber,
  lineMarks,
  linesFoundText,
  photoAlt,
  readLinesStatus,
  type ReadField,
} from './readLines'
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
// "Add stock by hand". 11b draws the reader's lines on the photo, numbered
// like the fields they filled.

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

// The engine that read the box, as "Read by … on this phone" names it.
const ENGINE_NAME: Record<OcrEngine, string> = { 'pp-ocr': 'PP-OCRv5', tesseract: 'Tesseract' }

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
  const [focused, setFocused] = useState<ReadField | null>(null)
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

  // 11b: the reader's lines on the photo, numbered like the fields they filled.
  const boxes = scan && photoUrl ? { count: scan.frames.length, lines: fieldLines(scan.reading, scan.frames.length) } : null
  const focusedLine = boxes && focused ? (boxes.lines[focused] ?? null) : null

  // A field's label, after its number when its line is on the photo.
  function label(field: ReadField, text: string) {
    if (boxes?.lines[field] === undefined) return text
    return (
      <span className={styles.numbered}>
        <NumberTag text={String(fieldNumber(field))} />
        {text}
      </span>
    )
  }

  // Editing a read field highlights its line on the photo.
  const tracks = (field: ReadField) => ({ onFocus: () => setFocused(field), onBlur: () => setFocused(null) })

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
            {photoUrl && boxes && (
              <LineBoxes
                photoUrl={photoUrl}
                alt={photoAlt(boxes.count)}
                frames={scan.frames}
                marks={lineMarks(scan.reading, boxes.count)}
                focusedLine={focusedLine}
              />
            )}
            <p className={styles.readText}>
              <span className={styles.line}>{readTimeText(scan.readMs, scan.loadMs)}</span>
              {boxes && <span className={styles.line}>{linesFoundText(boxes.count)}</span>}
              <span className={styles.line}>The photo is deleted when you leave.</span>
            </p>
            {boxes && (
              <p role="status" className="visually-hidden">
                {readLinesStatus(boxes.count)}
              </p>
            )}
          </div>
        )}
        <h1 ref={headingRef} tabIndex={-1} className={cx(screen.title, scan ? styles.title : styles.titleFirst)}>
          {scan ? 'Check what was read' : 'Add stock by hand'}
        </h1>
        {scan && <p className={styles.sub}>Fix anything that's wrong. Nothing is saved until you confirm.</p>}

        <div className={styles.fields}>
          <Field label={label('drug', 'Medicine')} tag={tags?.drug} helper={tags && HELPERS[tags.drug]} error={errors.drug}>
            {(input) => (
              <input
                {...input}
                {...tracks('drug')}
                value={draft.drug}
                autoComplete="off"
                onChange={(event) => set('drug', event.target.value)}
              />
            )}
          </Field>
          <Field label={label('strength', 'Strength')} tag={tags?.strength} helper={tags && HELPERS[tags.strength]}>
            {(input) => (
              <input
                {...input}
                {...tracks('strength')}
                value={draft.strength}
                autoComplete="off"
                onChange={(event) => set('strength', event.target.value)}
              />
            )}
          </Field>
          <Field label={label('lot', 'Lot number')} tag={tags?.lot} helper={tags && HELPERS[tags.lot]} error={errors.lot}>
            {(input) => (
              <input
                {...input}
                {...tracks('lot')}
                className={cx(input.className, styles.mono)}
                value={draft.lot}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(event) => set('lot', event.target.value)}
              />
            )}
          </Field>
          <Field label={label('expiry', 'Expiry')} tag={tags?.expiry} helper={tags && HELPERS[tags.expiry]} error={errors.expiry}>
            {(input) => (
              <span className={styles.withIcon}>
                <input
                  {...input}
                  {...tracks('expiry')}
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
            <p className={styles.engine}>Read by {ENGINE_NAME[OCR_ENGINE]} on this phone</p>
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
