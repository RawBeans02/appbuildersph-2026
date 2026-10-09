import { ArrowClockwiseIcon, CloudSlashIcon, LockKeyIcon, SignOutIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, Field, StateBlock } from '../../components'
import { cx } from '../../components/cx'
import { DEMO_MUNICIPALITY } from '../../data/places'
import { useOnlineStatus } from '../../lib/useOnlineStatus'
import type { ReportsResponse } from '../../../server/protocol'
import { problemText, type ApiResult, type SyncProblem } from '../municipal/sync/client'
import { SecretInput } from '../municipal/sync/SecretInput'
import { AlertsPanel } from './AlertsPanel'
import styles from './DohPage.module.css'
import { dohView, fetchReports, savedCode, type DohCells, type DohView } from './view'

// Phase 2 (VITE_PHASE2): the DOH or regional view, online only. The latest
// report from each barangay of the municipality, as the municipal laptop
// synced it: suppressed counts only, never a record. The view code stays in
// this tab's sessionStorage.
// NEEDS DESIGN (TASKS.md P2-B): this page, built on the tokens and shared
// components until Claude Design pass 2.

const COLUMNS: { key: keyof DohCells; label: string }[] = [
  { key: 'exposed', label: 'Exposed, watch not started yet' },
  { key: 'inWatchWindow', label: 'In watch window' },
  { key: 'fastBreathing', label: 'Fast-breathing referrals' },
  { key: 'urgentReferrals', label: 'Urgent referrals' },
  { key: 'doxyOnHand', label: 'Doxycycline on hand' },
  { key: 'doxyExpiring', label: 'Expiring in 6 weeks' },
  { key: 'flags', label: 'Flags for clinician review' },
]

type Load =
  | { status: 'code'; problem: SyncProblem | null }
  | { status: 'loading' }
  | { status: 'problem'; problem: SyncProblem }
  | { status: 'ready'; response: ReportsResponse }

export default function DohPage() {
  const online = useOnlineStatus()
  const [load, setLoad] = useState<Load>(() => (savedCode.get() ? { status: 'loading' } : { status: 'code', problem: null }))
  // The code typed in this tab (savedCode keeps it only once the server took it).
  const [activeCode, setActiveCode] = useState<string | null>(() => savedCode.get())

  // The server's answer for `code`, as the page's state.
  const apply = useCallback((code: string, result: ApiResult<ReportsResponse>) => {
    if (result.ok) {
      savedCode.set(code)
      setLoad({ status: 'ready', response: result.value })
    } else if (result.problem.kind === 'wrong-code') {
      savedCode.clear()
      setActiveCode(null)
      setLoad({ status: 'code', problem: result.problem })
    } else {
      setLoad({ status: 'problem', problem: result.problem })
    }
  }, [])

  // A code from earlier in this tab opens the reports straight away.
  useEffect(() => {
    const code = savedCode.get()
    if (!online || !code) return
    let live = true
    fetchReports(code, DEMO_MUNICIPALITY.code).then((result) => live && apply(code, result))
    return () => {
      live = false
    }
  }, [online, apply])

  const open = (code: string) => {
    setActiveCode(code)
    setLoad({ status: 'loading' })
    void fetchReports(code, DEMO_MUNICIPALITY.code).then((result) => apply(code, result))
  }

  const forget = () => {
    savedCode.clear()
    setActiveCode(null)
    setLoad({ status: 'code', problem: null })
  }

  const retry = () => {
    const code = activeCode ?? savedCode.get()
    if (code) open(code)
    else setLoad({ status: 'code', problem: null })
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.brand}>AgapayMo · DOH view</p>
          <h1 className={styles.title}>Barangay reports</h1>
          <p className={styles.sub}>{DEMO_MUNICIPALITY.name} · the latest report from each barangay, as the municipal laptop synced it</p>
        </div>
        {online && load.status === 'ready' && (
          <div className={styles.actions}>
            <Button variant="secondary" onClick={retry} icon={<ArrowClockwiseIcon size={22} weight="bold" aria-hidden />}>
              Refresh
            </Button>
            <Button variant="text" onClick={forget} icon={<SignOutIcon size={22} weight="bold" aria-hidden />}>
              Forget the code
            </Button>
          </div>
        )}
      </header>

      {!online ? (
        <StateBlock
          icon={CloudSlashIcon}
          title="The DOH view needs internet."
          body="It reads the latest barangay reports from the sync server. Nothing is kept on this device."
        />
      ) : load.status === 'code' ? (
        <CodeForm problem={load.problem} onSubmit={open} />
      ) : load.status === 'loading' ? (
        <p className={styles.note} role="status">
          Loading the reports…
        </p>
      ) : load.status === 'problem' ? (
        <StateBlock
          tone={load.problem.kind === 'not-configured' ? 'empty' : 'error'}
          icon={WarningCircleIcon}
          title={problemText(load.problem).title}
          body={load.problem.kind === 'not-configured' ? 'The DOH view opens once sync is set up.' : problemText(load.problem).body}
        >
          {load.problem.kind !== 'not-configured' && (
            <Button variant="secondary" onClick={retry}>
              Try again
            </Button>
          )}
        </StateBlock>
      ) : (
        <Reports view={dohView(load.response)} />
      )}
      {online && activeCode && (load.status === 'ready' || load.status === 'problem') && <AlertsPanel code={activeCode} />}
    </div>
  )
}

function CodeForm({ problem, onSubmit }: { problem: SyncProblem | null; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (code.trim()) onSubmit(code.trim())
  }
  return (
    <section className={styles.card} aria-labelledby="code-heading">
      <h2 id="code-heading" className={styles.heading}>
        Open the reports
      </h2>
      <p className={styles.lead}>Type the DOH view code. It's kept in this tab only, until you close it.</p>
      <form className={styles.form} onSubmit={submit}>
        <Field label="View code" error={problem?.kind === 'wrong-code' ? "That view code isn't right." : null}>
          {(input) => <SecretInput input={input} name="view code" value={code} onChange={setCode} />}
        </Field>
        <div className={styles.formActions}>
          <Button type="submit" disabled={code.trim() === ''} icon={<LockKeyIcon size={22} weight="bold" aria-hidden />}>
            Open the reports
          </Button>
        </div>
      </form>
    </section>
  )
}

export function Reports({ view }: { view: DohView }) {
  if (view.rows.length === 0) {
    return (
      <StateBlock
        icon={CloudSlashIcon}
        title="No barangay reports yet"
        body="They appear here after the municipal laptop syncs."
      />
    )
  }
  return (
    <>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Barangay</th>
              <th scope="col">Week</th>
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col" className={styles.number}>
                  {column.label}
                </th>
              ))}
              <th scope="col">Received</th>
              <th scope="col">From laptop key</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.barangay}>
                <th scope="row">{row.name}</th>
                <td className={cx(row.olderWeek && styles.older)}>
                  {row.week}
                  {row.olderWeek && <span className={styles.earlier}>Earlier week</span>}
                </td>
                {COLUMNS.map((column) => (
                  <td key={column.key} className={styles.number}>
                    {row.cells[column.key]}
                  </td>
                ))}
                <td>{row.received}</td>
                <td className={styles.fingerprint}>{row.from}</td>
              </tr>
            ))}
          </tbody>
          {view.totals && (
            <tfoot>
              <tr>
                <th scope="row">
                  Total, {view.totals.barangays} {view.totals.barangays === 1 ? 'barangay' : 'barangays'}
                </th>
                <td>{view.totals.week}</td>
                {COLUMNS.map((column) => (
                  <td key={column.key} className={styles.number}>
                    {view.totals!.cells[column.key]}
                  </td>
                ))}
                <td />
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className={styles.footnote}>
        Counts are as the phones sent them: “&lt;5” means 1 to 4 people, so sums show as ranges. The total covers the newest
        week only; a barangay whose latest report is from an earlier week is marked "Earlier week" and left out of it. No
        names, birthdays or addresses reach this view.
      </p>
    </>
  )
}
