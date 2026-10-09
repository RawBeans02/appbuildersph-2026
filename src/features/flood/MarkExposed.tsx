import { CheckIcon, CircleNotchIcon, InfoIcon } from '@phosphor-icons/react'
import { useCallback, useState } from 'react'
import { BottomSheet, Button, FlowTopBar, RecordsError } from '../../components'
import { useHoldReload } from '../../lib/useHoldReload'
import { cx } from '../../components/cx'
import type { ExposureKind } from '../../data/db/types'
import { monthDay, weekdayMonthDay } from '../../lib/format'
import { WATCH_END_DAY, WATCH_START_DAY, watchWindow } from '../../rules/watch'
import { householdsByPurok, normalizeKinds, planMarks, type Household, type Marks } from './flood'
import styles from './Watch.module.css'
import { householdWords, peopleWords } from './words'

// 8b: who waded in floodwater. A tap marks a whole household; tap again to
// undo. "Waded" is on for every mark; "Open wound" and "Repeated" are optional.
// Marks stay on this screen until Confirm (8c) writes them. Only today's
// contact can be undone here: a household exposed on an earlier day of this
// flood shows that day, and marking it again adds today as a second day.

// Changes made on this screen: household id → its kinds, or null (unmarked).
export type MarkEdits = Map<string, ExposureKind[] | null>

const OPTIONAL_DETAILS: { kind: ExposureKind; label: string }[] = [
  { kind: 'open-wound', label: 'Open wound' },
  { kind: 'repeated', label: 'Repeated' },
]

export type MarkData =
  | { status: 'loading' | 'error' }
  | {
      status: 'ready'
      households: Household[]
      // The puroks with floodwater, shown first.
      affected: string[]
      // Today's marks already saved for this flood.
      before: Marks
      // Households with contact on an earlier day of this flood → that day.
      earlier: Map<string, string>
    }

function HouseholdRow({
  household,
  kinds,
  earlierOn,
  onToggle,
  onToggleKind,
}: {
  household: Household
  kinds: ExposureKind[] | null
  earlierOn: string | undefined
  onToggle: () => void
  onToggleKind: (kind: ExposureKind) => void
}) {
  const labelId = `household-${household.id}`
  const marked = kinds !== null
  return (
    <li className={styles.household}>
      <button type="button" className={styles.householdButton} aria-pressed={marked} onClick={onToggle}>
        <span className={cx(styles.box, marked && styles.boxOn)} aria-hidden>
          {marked && <CheckIcon size={18} weight="bold" />}
        </span>
        <span className={styles.householdText}>
          <span id={labelId} className={cx(styles.householdId, marked && styles.householdIdOn)}>
            {household.id}
          </span>
          {earlierOn && <span className={styles.householdMeta}>waded {monthDay(earlierOn)}</span>}
        </span>
        <span className={styles.householdCount}>{peopleWords(household.members.length)}</span>
      </button>
      {marked && (
        <div role="group" aria-labelledby={labelId} className={styles.details}>
          <span className={cx(styles.detail, styles.detailOn)}>
            <CheckIcon size={15} weight="bold" aria-hidden />
            Waded
          </span>
          {OPTIONAL_DETAILS.map(({ kind, label }) => {
            const on = kinds.includes(kind)
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                className={cx(styles.detail, on && styles.detailOn)}
                onClick={() => onToggleKind(kind)}
              >
                {on && <CheckIcon size={15} weight="bold" aria-hidden />}
                {label}
              </button>
            )
          })}
        </div>
      )}
    </li>
  )
}

export function MarkExposed({
  data,
  edits,
  onEdit,
  today,
  onBack,
  onSave,
}: {
  data: MarkData
  edits: MarkEdits
  onEdit: (edits: MarkEdits) => void
  today: string
  onBack: () => void
  // Writes the marks; resolves once saved.
  onSave: (after: Marks) => Promise<void>
}) {
  // What is typed or marked here isn't saved yet: a new version waits.
  useHoldReload()
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const closeSheet = useCallback(() => setConfirming(false), [])

  const ready = data.status === 'ready' ? data : null
  const households = ready?.households ?? []
  const before: Marks = ready?.before ?? new Map()
  const current = (id: string): ExposureKind[] | null => (edits.has(id) ? edits.get(id)! : (before.get(id) ?? null))
  const after: Marks = new Map(
    households.flatMap((household) => {
      const kinds = current(household.id)
      return kinds ? [[household.id, kinds] as const] : []
    }),
  )
  const marked = households.filter((household) => after.has(household.id))
  const plan = planMarks(before, after)
  const changed = plan.add.length + plan.update.length + plan.remove.length > 0
  const byId = new Map(households.map((household) => [household.id, household]))
  const starting = plan.add.reduce((sum, [id]) => sum + (byId.get(id)?.members.length ?? 0), 0)
  const watch = watchWindow(today)

  const toggle = (household: Household) => {
    const next = new Map(edits)
    if (current(household.id)) next.set(household.id, null)
    else next.set(household.id, before.get(household.id) ?? (ready?.earlier.has(household.id) ? ['waded', 'repeated'] : ['waded']))
    onEdit(next)
  }
  const toggleKind = (household: Household, kind: ExposureKind) => {
    const kinds = current(household.id) ?? ['waded']
    onEdit(new Map(edits).set(household.id, kinds.includes(kind) ? kinds.filter((k) => k !== kind) : normalizeKinds([...kinds, kind])))
  }

  async function save() {
    setSaving(true)
    try {
      await onSave(after)
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
      setConfirming(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <FlowTopBar onBack={onBack} step={{ text: 'Step 2 of 2', current: 2, total: 2 }} />
        <div className={styles.flowBody}>
          <h1 className={styles.flowTitle}>Who waded in floodwater?</h1>
          <p className={styles.flowLeadSmall}>Tap a household to mark everyone in it. Tap again to undo.</p>
        </div>

        {data.status === 'loading' && (
          <p className={styles.loading} role="status">
            <CircleNotchIcon size={18} weight="bold" aria-hidden />
            Opening the records on this phone…
          </p>
        )}
        {(data.status === 'error' || saveFailed) && <RecordsError />}
        {ready && !saveFailed && households.length === 0 && <p className={styles.noResidents}>No residents on this phone yet.</p>}
        {ready &&
          !saveFailed &&
          householdsByPurok(households, ready.affected).map((group) => (
            <section key={group.purok}>
              <h2 className={styles.purok}>{group.purok}</h2>
              <ul className={styles.card}>
                {group.households.map((household) => (
                  <HouseholdRow
                    key={household.id}
                    household={household}
                    kinds={current(household.id)}
                    earlierOn={ready.earlier.get(household.id)}
                    onToggle={() => toggle(household)}
                    onToggleKind={(kind) => toggleKind(household, kind)}
                  />
                ))}
              </ul>
            </section>
          ))}
      </div>

      {ready && !saveFailed && households.length > 0 && (
        <div className={cx(styles.footer, styles.flowFooter)}>
          <p className={styles.summary} aria-live="polite">
            <span className={styles.summaryStrong}>
              {peopleWords(marked.reduce((sum, household) => sum + household.members.length, 0))} marked
            </span>
            <span className={styles.summaryMeta}>{householdWords(marked.length)}</span>
          </p>
          <Button
            disabled={!changed || saving}
            onClick={() => (plan.add.length > 0 ? setConfirming(true) : void save())}
          >
            Confirm and start the watch
          </Button>
        </div>
      )}

      <BottomSheet open={confirming} onClose={closeSheet} title={`Start the watch for ${peopleWords(starting)}?`}>
        <div>
          <p className={styles.sheetLead}>
            They were in the floodwater today. Watch them from <b>{weekdayMonthDay(watch.start)}</b> to{' '}
            <b>{weekdayMonthDay(watch.end)}</b> (days {WATCH_START_DAY} to {WATCH_END_DAY}).
          </p>
          <p className={styles.infoNote}>
            <InfoIcon className={styles.noteIcon} size={22} weight="bold" aria-hidden />
            If one gets fever, muscle pain or red eyes, refer them to the RHU physician.
          </p>
          <Button className={styles.sheetPrimary} tagalog="Simulan" disabled={saving} onClick={() => void save()}>
            Start the watch
          </Button>
          <div className={styles.sheetLink}>
            <Button variant="text" onClick={closeSheet}>
              Back to the list
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
