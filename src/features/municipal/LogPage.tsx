import { ClockCounterClockwiseIcon, ListNumbersIcon, LockSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button, ButtonLink, StateBlock } from '../../components'
import { cx } from '../../components/cx'
import { useDbQuery } from '../../data/db/useDbQuery'
import { LaptopFrame } from './LaptopFrame'
import styles from './LogPage.module.css'
import { justApproved, logRow, type LogRow } from './log'
import { readApprovalLog, type LogEntry } from './municipal'
import { useLaptopPlace } from './place'

// Screen 20: every approved plan on this laptop, newest first. Approvers are
// roles, never names. Entries can't be edited; a new approval is a new row.
// Each row opens its full approved text (B25). The newest, when approved in
// this browser session, is "Just now" on --ok-tint and lands once (20c).

export default function LogPage() {
  const data = useDbQuery(['approvals', 'plans'], readApprovalLog)
  const { sample } = useLaptopPlace()

  return (
    <LaptopFrame
      active="log"
      title="Approval log"
      sub={
        <span className={styles.sub}>
          <LockSimpleIcon size={18} weight="bold" aria-hidden />
          {sample ? 'Kept on this laptop only · Sample data' : 'Kept on this laptop only'}
        </span>
      }
    >
      {data.status === 'loading' && <p className={styles.note}>Opening the records on this laptop…</p>}
      {data.status === 'error' && (
        <StateBlock tone="error" icon={WarningCircleIcon} title="Couldn't open the records" body="Nothing was lost. Your records are still saved on this laptop.">
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </StateBlock>
      )}
      {data.status === 'ready' && data.data.length === 0 && (
        // 20b: one action, back to the plan.
        <StateBlock
          icon={ClockCounterClockwiseIcon}
          title="No plans approved yet"
          body="Approved plans show here, with who approved them and when."
        >
          <ButtonLink to="/municipal/plan" icon={<ListNumbersIcon size={22} weight="bold" aria-hidden />}>
            Go to the plan
          </ButtonLink>
        </StateBlock>
      )}
      {data.status === 'ready' && data.data.length > 0 && <LogList entries={data.data} />}
    </LaptopFrame>
  )
}

function LogList({ entries }: { entries: LogEntry[] }) {
  const rows = entries.map(logRow)
  const [justNow] = useState(() => justApproved(rows))
  return <LogTable rows={rows} justNow={justNow} />
}

type JustNow = { id: string; land: boolean } | null

export function LogTable({ rows, justNow = null }: { rows: LogRow[]; justNow?: JustNow }) {
  return (
    <table className={styles.table}>
      <colgroup>
        <col className={styles.colWhen} />
        <col className={styles.colWho} />
        <col />
        <col className={styles.colFrom} />
        <col className={styles.colWording} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">Approved by</th>
          <th scope="col">Plan</th>
          <th scope="col">From</th>
          <th scope="col">Wording</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className={cx(justNow?.id === row.id && styles.justNow, justNow?.id === row.id && justNow.land && 'land')}>
            <th scope="row">
              {row.day}
              <span className={styles.time}>{row.time}</span>
              {justNow?.id === row.id && <span className={styles.justNowWord}>Just now</span>}
            </th>
            <td>{row.approver}</td>
            <td>
              {row.plan}
              {row.text && (
                <details className={styles.full}>
                  <summary>Full approved text</summary>
                  <p className={styles.fullText}>{row.text}</p>
                </details>
              )}
            </td>
            <td>
              {row.from}
              {row.week && <span className={styles.week}>{row.week}</span>}
            </td>
            <td>{row.wording}<ButtonLink to={`/municipal/return?approval=${encodeURIComponent(row.id)}`} variant="text">Make return QR</ButtonLink></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
