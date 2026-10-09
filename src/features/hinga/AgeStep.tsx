import { ArrowRightIcon, CaretDownIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button, CheckRow, Field, FlowTopBar, RadioRow } from '../../components'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery } from '../../data/db/useDbQuery'
import { localToday } from '../../rules/dates'
import { completedMonths, MAX_AGE_MONTHS } from '../../rules/imci'
import { AGE_BANDS, ageBand } from './copy'
import type { Child } from './flow'
import styles from './Hinga.module.css'

// 2a, step 1: the age band and the readiness tick, and an optional resident.
// Next stays off until a band is picked and the box is ticked.

const readResidents = (db: AgapayDb) => db.residents.list({ limit: 1000 })

export function AgeStep({ child, onChange, onNext, onBack }: { child: Child; onChange(child: Child): void; onNext(): void; onBack(): void }) {
  const residents = useDbQuery(['residents'], readResidents)
  const [today] = useState(localToday)
  const children =
    residents.status === 'ready'
      ? residents.data.flatMap((resident) => {
          const months = completedMonths(resident.birthDate, today)
          return months >= 0 && months < MAX_AGE_MONTHS ? [{ resident, months }] : []
        })
      : []
  const band = child.ageMonths === null ? null : ageBand(child.ageMonths)

  function pickBand(firstMonth: number) {
    // A linked resident in another band no longer matches the age.
    const keep = child.resident && child.ageMonths !== null && ageBand(child.ageMonths)?.firstMonth === firstMonth
    onChange({ ...child, resident: keep ? child.resident : null, ageMonths: keep ? child.ageMonths : firstMonth })
  }

  function pickResident(id: string) {
    const picked = children.find(({ resident }) => resident.id === id)
    if (!picked) return onChange({ ...child, resident: null })
    const { resident, months } = picked
    onChange({ ...child, resident: { id: resident.id, name: resident.name, householdId: resident.householdId }, ageMonths: months })
  }

  return (
    <div className={styles.screen}>
      <FlowTopBar onBack={onBack} step={{ text: 'Hinga · step 1 of 3', current: 1, total: 3 }} />
      <div className={styles.body}>
        <h1 className={styles.title}>How old is the child?</h1>
        <p className={styles.sub}>The cut-off for fast breathing depends on age.</p>
        <div role="radiogroup" aria-label="Age" className={styles.group}>
          {AGE_BANDS.map((option) => {
            const cutoff = ageBand(option.firstMonth)!.cutoff
            return (
              <RadioRow
                key={option.firstMonth}
                name="hinga-age"
                value={String(option.firstMonth)}
                label={option.label}
                meta={`fast: ${cutoff}+ /min`}
                checked={band?.firstMonth === option.firstMonth}
                onSelect={(value) => pickBand(Number(value))}
              />
            )
          })}
        </div>

        <h2 className={styles.sectionTitle}>Before you start</h2>
        <div className={styles.group}>
          <CheckRow
            label="The child is calm: not crying, not feeding, and the chest is visible."
            checked={child.calm}
            onChange={(calm) => onChange({ ...child, calm })}
          />
        </div>

        <div className={styles.field}>
          <Field label="Link a resident" optional trailingIcon={<CaretDownIcon size={20} weight="bold" />}>
            {(input) => (
              <select {...input} value={child.resident?.id ?? ''} onChange={(event) => pickResident(event.target.value)}>
                <option value="" />
                {children.map(({ resident }) => (
                  <option key={resident.id} value={resident.id}>
                    {resident.name} · {resident.householdId}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </div>
      <div className={styles.footer}>
        <Button
          disabled={band === null || !child.calm}
          iconEnd={<ArrowRightIcon size={22} weight="bold" aria-hidden />}
          onClick={onNext}
        >
          Next: point the camera
        </Button>
      </div>
    </div>
  )
}
