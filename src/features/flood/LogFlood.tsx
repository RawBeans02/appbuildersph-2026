import { ArrowRightIcon, CalendarBlankIcon, CheckIcon, LockSimpleIcon } from '@phosphor-icons/react'
import { useId, type MouseEvent } from 'react'
import { Button, Field, FlowTopBar } from '../../components'
import { useHoldReload } from '../../lib/useHoldReload'
import { cx } from '../../components/cx'
import styles from './Watch.module.css'
import { floodDateWords } from './words'

// 8a: log a flood. The date defaults to today and can't be in the future; the
// areas with floodwater are optional and stay on this phone (never in the QR).

export type FloodDraft = { startedOn: string; puroks: string[] }

function openPicker(event: MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker()
  } catch {
    // Not supported, or already open: the input still works by keyboard.
  }
}

export function LogFlood({
  draft,
  onChange,
  puroks,
  today,
  onBack,
  onNext,
}: {
  draft: FloodDraft
  onChange: (draft: FloodDraft) => void
  // The residents' puroks, for the chips.
  puroks: string[]
  today: string
  onBack: () => void
  onNext: () => void
}) {
  // What is typed or marked here isn't saved yet: a new version waits.
  useHoldReload()
  const areasId = useId()
  const togglePurok = (purok: string) =>
    onChange({
      ...draft,
      puroks: draft.puroks.includes(purok) ? draft.puroks.filter((p) => p !== purok) : [...draft.puroks, purok],
    })

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <FlowTopBar onBack={onBack} step={{ text: 'Step 1 of 2', current: 1, total: 2 }} />
        <div className={styles.flowBody}>
          <h1 className={styles.flowTitle}>Log a flood</h1>
          <p className={styles.flowLead}>This starts the leptospirosis watch for everyone who waded in the water.</p>

          <div className={styles.block}>
            <Field label="The flood started on">
              {({ className, ...input }) => (
                <div className={cx(className, styles.dateBox)}>
                  <span aria-hidden>{floodDateWords(draft.startedOn, today)}</span>
                  <CalendarBlankIcon size={22} weight="bold" aria-hidden />
                  <input
                    {...input}
                    type="date"
                    className={styles.dateInput}
                    value={draft.startedOn}
                    max={today}
                    required
                    onClick={openPicker}
                    onChange={(event) => {
                      const day = event.target.value
                      if (day && day <= today) onChange({ ...draft, startedOn: day })
                    }}
                  />
                </div>
              )}
            </Field>
          </div>

          {puroks.length > 0 && (
            <div className={styles.block}>
              <p id={areasId} className={styles.groupLabel}>
                Areas with floodwater <span className={styles.optional}>(optional)</span>
              </p>
              <div role="group" aria-labelledby={areasId} className={styles.chips}>
                {puroks.map((purok) => {
                  const on = draft.puroks.includes(purok)
                  return (
                    <button
                      key={purok}
                      type="button"
                      aria-pressed={on}
                      className={cx(styles.chip, on && styles.chipOn)}
                      onClick={() => togglePurok(purok)}
                    >
                      {on && <CheckIcon size={18} weight="bold" aria-hidden />}
                      {purok}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <p className={cx(styles.lockNote, puroks.length === 0 && styles.lockNoteAlone)}>
            <LockSimpleIcon size={18} weight="bold" aria-hidden />
            Kept on this phone only. Never in the QR.
          </p>
        </div>
      </div>
      <div className={cx(styles.footer, styles.flowFooter, styles.plainFooter)}>
        <Button onClick={onNext}>
          <span className={styles.trailing}>
            Next: mark who was exposed
            <ArrowRightIcon size={22} weight="bold" aria-hidden />
          </span>
        </Button>
      </div>
    </div>
  )
}
