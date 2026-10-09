import { CheckCircleIcon, InfoIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { Button, CheckRow, FlowTopBar } from '../../components'
import { getDb } from '../../data/db/appDb'
import type { HingaCheck } from '../../data/db/types'
import { hingaOutcome, type DangerSign } from '../../rules/imci'
import { buildHingaCheck, newCheckId, type CountMethodUsed } from './check'
import { CryOffNote } from './CameraScreens'
import {
  bandText,
  DANGER_SIGN_COPY,
  DANGER_SIGN_ROWS,
  HEADLINES,
  metaLine,
  recheckText,
  savedText,
  SCREENING_NOTE,
  timeText,
  type AgeBand,
  type ResultKind,
} from './copy'
import { answered, tickNone, tickSign, type DangerAnswer, type LinkedResident } from './flow'
import styles from './Hinga.module.css'
import { ResultBand } from './ResultBand'

// 6a fast, 6b URGENT, 7a not fast, then 6c saved. The same screens for a
// count by the camera and by hand ("Counted by hand" in the meta line). Any
// danger sign makes it URGENT at once; Save needs a tick or "None of these".
// With no count (perMin null, the "Danger sign seen? Refer now" route) the
// same checklist shows first: a tick gives the URGENT band and Save, and
// "None of these" goes back to the screen it came from (onNoSigns).

export type Reading = { perMin: number | null; at: string; method: CountMethodUsed; cryOff: string | null }

export type SavedCheck = { check: HingaCheck; at: string }

const NO_ANSWER: DangerAnswer<DangerSign> = { signs: [], none: false }

export function ResultScreen(props: {
  reading: Reading
  ageMonths: number
  band: AgeBand
  resident: LinkedResident | null
  saved: SavedCheck | null
  onSaved(saved: SavedCheck): void
  // No count: "None of these" goes back.
  onNoSigns?(): void
  onClose(): void
  onAnother(): void
  onDone(): void
}) {
  const { reading, band, resident, saved } = props
  const [answer, setAnswer] = useState(NO_ANSWER)
  const [saving, setSaving] = useState(false)
  // A second tap before the first save re-renders must not save twice.
  const savingRef = useRef(false)
  const [failed, setFailed] = useState(false)
  const signs = saved ? (saved.check.dangerSigns as DangerSign[]) : answer.signs
  const counted = reading.perMin !== null
  const outcome = hingaOutcome({ breathsPerMinute: reading.perMin, ageMonths: props.ageMonths, dangerSigns: signs })
  // No count and no sign ticked yet: no band, only the checklist.
  const kind: ResultKind | null = outcome === 'refused' || outcome === null ? null : outcome
  const bandLines = kind && bandText(kind, reading.perMin, band, signs)
  const headline = kind && HEADLINES[kind]
  // With no count, only a ticked sign can be saved (an URGENT referral).
  const canSave = counted ? answered(answer) : answer.signs.length > 0

  function onAnswer(next: DangerAnswer<DangerSign>) {
    if (!counted && next.none) props.onNoSigns?.()
    else setAnswer(next)
  }

  async function save() {
    if (savingRef.current || saved || !canSave) return
    savingRef.current = true
    setSaving(true)
    setFailed(false)
    const check = buildHingaCheck({
      id: newCheckId(),
      residentId: resident?.id ?? null,
      checkedAt: reading.at,
      ageMonths: props.ageMonths,
      method: reading.method,
      breathsPerMinute: reading.perMin,
      refusal: null,
      dangerSigns: answer.signs,
    })
    try {
      if (!check) throw new Error('The age is outside the IMCI range.')
      await (await getDb()).hingaChecks.put(check)
      props.onSaved({ check, at: new Date().toISOString() })
    } catch (error) {
      console.error('Hinga: could not save the check', error)
      setFailed(true)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const confirmation = saved ? savedText(resident?.name ?? null, saved.check.dangerSigns.length, timeText(saved.at)) : null

  return (
    <div className={styles.screen}>
      <FlowTopBar backKind="close" onBack={props.onClose} />
      <div className={styles.body}>
        <p className={styles.meta}>
          {metaLine({ resident, band, time: timeText(reading.at), method: counted ? reading.method : null })}
        </p>
        {kind && bandLines && <ResultBand kind={kind} {...bandLines} />}
        {reading.cryOff && <CryOffNote reason={reading.cryOff} />}
        {headline ? (
          <div className={styles.headline}>
            <h1 lang="tl">{headline.tagalog}</h1>
            <p>{headline.english}</p>
          </div>
        ) : (
          <h1 className="visually-hidden">Hinga breathing check</h1>
        )}

        {kind === 'not-fast' && !saved && (
          <>
            <h2 className={styles.sectionTitle}>When to check again</h2>
            <p className={styles.recheck}>
              {recheckText(band)}{' '}
              <span className={styles.source}>(WHO IMCI 2014)</span>
            </p>
            <p className={styles.warnNote}>
              <WarningIcon size={22} weight="bold" aria-hidden />
              See a danger sign? Refer now, whatever the count.
            </p>
          </>
        )}

        {confirmation ? (
          <div role="status" className={styles.saved}>
            {/* 6c: only this check stamps (saved is set by the Save tap in this visit, never
                restored). The result's number, band and headline never animate. */}
            <CheckCircleIcon className="stamp" size={24} weight="bold" aria-hidden />
            <div>
              <p className={styles.savedTitle}>{confirmation.title}</p>
              <p className={styles.savedDetail}>{confirmation.detail}</p>
            </div>
          </div>
        ) : (
          <DangerSigns answer={answer} onChange={onAnswer} />
        )}

        <p className={styles.note}>
          <InfoIcon size={20} weight="bold" aria-hidden />
          {SCREENING_NOTE}
        </p>
        {failed && (
          // NEEDS DESIGN: a save that failed.
          <p role="alert" className={styles.errorNote}>
            <WarningCircleIcon size={20} weight="bold" aria-hidden />
            Couldn't save to the record. Try again.
          </p>
        )}
      </div>

      {saved ? (
        <div className={styles.footer}>
          <Button tagalog="Tapos na" onClick={props.onDone}>
            Done
          </Button>
          <Button variant="secondary" onClick={props.onAnother}>
            Check another child
          </Button>
        </div>
      ) : (
        <div className={`${styles.footer} ${styles.saveBar}`}>
          {!canSave && (
            <p className={styles.saveHint}>
              {counted ? 'Tick any danger signs, or None of these, to save.' : 'Tick any danger sign you see. None of these goes back.'}
            </p>
          )}
          <Button tagalog="I-save" disabled={!canSave || saving} onClick={() => void save()}>
            {kind === 'urgent' ? 'Save as URGENT' : 'Save to the record'}
          </Button>
          {kind === 'not-fast' && (
            <Button variant="text" onClick={props.onAnother}>
              Check another child
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function DangerSigns({ answer, onChange }: { answer: DangerAnswer<DangerSign>; onChange(answer: DangerAnswer<DangerSign>): void }) {
  const ticked = answer.signs.length
  return (
    <div className={styles.signs}>
      <div className={styles.groupHead}>
        <h2 className={styles.groupTitle}>Check for danger signs</h2>
        <p>{ticked ? `${ticked} ticked` : 'Tick any you see, or None of these. Any sign makes this URGENT.'}</p>
      </div>
      {DANGER_SIGN_ROWS.map((sign) => {
        const { label, term } = DANGER_SIGN_COPY[sign]
        return (
          <CheckRow
            key={sign}
            label={
              <>
                {label}
                {term && <span className={styles.term}> ({term})</span>}
              </>
            }
            checked={answer.signs.includes(sign)}
            onChange={(on) => onChange(tickSign(answer, sign, on))}
          />
        )
      })}
      <div className={styles.noneRow}>
        <CheckRow label="None of these" checked={answer.none} onChange={(on) => onChange(tickNone(answer, on))} />
      </div>
    </div>
  )
}
