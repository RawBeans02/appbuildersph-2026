import { CheckCircleIcon, InfoIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { Button, CheckRow, FlowTopBar } from '../../components'
import { getDb } from '../../data/db/appDb'
import type { HingaCheck } from '../../data/db/types'
import { hingaOutcome, type DangerSign } from '../../rules/imci'
import { buildHingaCheck, newCheckId, type CountMethodUsed } from './check'
import { CryOffNote } from './CameraScreens'
import { bandText, DANGER_SIGN_COPY, DANGER_SIGN_IDS, HEADLINES, metaLine, savedText, SCREENING_NOTE, timeText, type AgeBand, type ResultKind } from './copy'
import { answered, tickNone, tickSign, type DangerAnswer, type LinkedResident } from './flow'
import styles from './Hinga.module.css'
import { ResultBand } from './ResultBand'

// 6a fast, 6b URGENT, 7a not fast, then 6c saved. The same screens for a
// count by the camera and by hand ("Counted by hand" in the meta line). Any
// danger sign makes it URGENT at once; Save needs a tick or "None of these".

export type Reading = { perMin: number; at: string; method: CountMethodUsed; cryOff: string | null }

export type SavedCheck = { check: HingaCheck; at: string }

const NO_ANSWER: DangerAnswer<DangerSign> = { signs: [], none: false }

export function ResultScreen(props: {
  reading: Reading
  ageMonths: number
  band: AgeBand
  resident: LinkedResident | null
  saved: SavedCheck | null
  onSaved(saved: SavedCheck): void
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
  const kind = hingaOutcome({ breathsPerMinute: reading.perMin, ageMonths: props.ageMonths, dangerSigns: signs }) as ResultKind
  const bandLines = bandText(kind, reading.perMin, band, signs)
  const headline = HEADLINES[kind]

  async function save() {
    if (savingRef.current || saved || !answered(answer)) return
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
        <p className={styles.meta}>{metaLine({ resident, band, time: timeText(reading.at), method: reading.method })}</p>
        <ResultBand kind={kind} {...bandLines} />
        {reading.cryOff && <CryOffNote reason={reading.cryOff} />}
        <div className={styles.headline}>
          <h1 lang="tl">{headline.tagalog}</h1>
          <p>{headline.english}</p>
        </div>

        {kind === 'not-fast' && !saved && (
          <>
            <h2 className={styles.sectionTitle}>When to check again</h2>
            <p className={styles.recheck}>
              In 5 days if the child isn't getting better. Right away if breathing gets faster or harder, or the child can't drink.{' '}
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
            <CheckCircleIcon size={24} weight="bold" aria-hidden />
            <div>
              <p className={styles.savedTitle}>{confirmation.title}</p>
              <p className={styles.savedDetail}>{confirmation.detail}</p>
            </div>
          </div>
        ) : (
          <DangerSigns answer={answer} onChange={setAnswer} />
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
          <Button tagalog="I-save" disabled={!answered(answer) || saving} onClick={() => void save()}>
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
    <>
      <div className={styles.signs}>
        <div className={styles.groupHead}>
          <h2 className={styles.groupTitle}>Check for danger signs</h2>
          <p>{ticked ? `${ticked} ticked` : 'Tick any you see, or None of these. One tick makes this URGENT.'}</p>
        </div>
        {DANGER_SIGN_IDS.map((sign) => {
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
      </div>
      <div className={styles.none}>
        <CheckRow label="None of these" checked={answer.none} onChange={(on) => onChange(tickNone(answer, on))} />
      </div>
    </>
  )
}
