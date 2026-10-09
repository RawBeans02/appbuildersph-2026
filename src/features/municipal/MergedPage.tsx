import { ClockIcon, FlagIcon, ListNumbersIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Button, ButtonLink, Pill, StateBlock } from '../../components'
import { cx } from '../../components/cx'
import { useDbQuery } from '../../data/db/useDbQuery'
import { nameOf } from './counts'
import { LaptopFrame } from './LaptopFrame'
import { mergedView, type MergedCells, type MergedView } from './merged'
import styles from './MergedPage.module.css'
import { readMunicipalScreen } from './municipal'
import { useLaptopPlace } from './place'

// Screen 18: the barangays' counts side by side, the totals, and which
// barangay the doctor team goes to first, with why. Rows don't open anything
// (the age-band detail isn't designed).

const COLUMNS: { key: keyof MergedCells; label: string }[] = [
  // The age bands count residents whose watch hasn't started yet; the watch
  // window is its own column (src/qr/schema.ts).
  { key: 'exposed', label: 'Exposed, watch not started yet' },
  { key: 'inWatchWindow', label: 'In watch window' },
  { key: 'fastBreathing', label: 'Fast-breathing referrals' },
  { key: 'doxyOnHand', label: 'Doxycycline on hand' },
  { key: 'doxyExpiring', label: 'Expiring in 6 weeks' },
]

export default function MergedPage() {
  const data = useDbQuery(['pairedDevices', 'receivedPayloads'], readMunicipalScreen)
  const { sample } = useLaptopPlace()

  if (data.status !== 'ready') {
    return (
      <LaptopFrame active="merged" title="Merged view">
        {data.status === 'loading' ? (
          <p className={styles.note}>Opening the records on this laptop…</p>
        ) : (
          <StateBlock tone="error" icon={WarningCircleIcon} title="Couldn't open the records" body="Nothing was lost. Your records are still saved on this laptop.">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </StateBlock>
        )}
      </LaptopFrame>
    )
  }

  const { plan, handoff, unverified } = data.data
  const view = mergedView(plan, handoff.received)
  const sub = [view.epiWeek ? `Week ${view.epiWeek}` : null, `${view.received} of ${view.expected} barangays`, sample ? 'Sample data' : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <LaptopFrame
      active="merged"
      title="Merged view"
      sub={sub}
      action={
        plan ? (
          <ButtonLink to="/municipal/plan" icon={<ListNumbersIcon size={22} weight="bold" aria-hidden />}>
            Make the plan
          </ButtonLink>
        ) : (
          <Button disabled icon={<ListNumbersIcon size={22} weight="bold" aria-hidden />}>
            Make the plan
          </Button>
        )
      }
    >
      {unverified.length > 0 && (
        <p role="alert" className={styles.alert}>
          <WarningCircleIcon size={20} weight="bold" aria-hidden />
          Left out: {unverified.map((item) => nameOf(item.barangay)).join(', ')}. The stored QR no longer matches the
          paired phone's key. Scan it again.
        </p>
      )}
      <MergedTable view={view} />
      {view.partial && <p className={styles.partial}>{view.partial}</p>}
      {view.why && (
        <div className={styles.why}>
          <FlagIcon size={22} weight="bold" className={styles.whyIcon} aria-hidden />
          <p>
            <strong>Why {view.why.name} first:</strong> {view.why.reason}
          </p>
        </div>
      )}
      <p className={styles.footnote}>
        Ranges include counts sent as “&lt;5” (1 to 4 people), which phones use to protect small households. No names,
        birthdays or addresses reach this laptop.
      </p>
    </LaptopFrame>
  )
}

export function MergedTable({ view }: { view: MergedView }) {
  return (
    <table className={styles.table}>
      <colgroup>
        <col className={styles.colName} />
        <col className={styles.colReceived} />
        {COLUMNS.map((column) => (
          <col key={column.key} className={styles.colNumber} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Barangay</th>
          <th scope="col">Received</th>
          {COLUMNS.map((column) => (
            <th key={column.key} scope="col" className={styles.number}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {view.rows.map((row) =>
          row.kind === 'waiting' ? (
            <tr key={row.barangay} className={styles.waiting}>
              <th scope="row">{row.name}</th>
              <td>
                <span className={styles.waitingWord}>
                  <ClockIcon size={16} weight="bold" aria-hidden />
                  Waiting
                </span>
              </td>
              {COLUMNS.map((column) => (
                <td key={column.key} className={cx(styles.number, styles.dash)}>
                  –
                </td>
              ))}
            </tr>
          ) : (
            <tr key={row.barangay} className={cx(row.priority && styles.priority)}>
              <th scope="row">
                <span className={styles.name}>
                  {row.name}
                  {row.priority && (
                    <Pill tone="warn" onTint icon={<FlagIcon size={16} weight="bold" aria-hidden />}>
                      Priority
                    </Pill>
                  )}
                </span>
              </th>
              <td className={styles.received}>
                {row.received}
                {row.olderWeek && <span className={styles.older}>Week {row.olderWeek}</span>}
              </td>
              {COLUMNS.map((column) => (
                <td
                  key={column.key}
                  className={cx(styles.number, column.key === 'doxyExpiring' && row.expiring && styles.expiring)}
                >
                  {row.cells[column.key]}
                </td>
              ))}
            </tr>
          ),
        )}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{view.totalLabel}</th>
          <td />
          {COLUMNS.map((column) => (
            <td key={column.key} className={styles.number}>
              {view.totals[column.key]}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  )
}
