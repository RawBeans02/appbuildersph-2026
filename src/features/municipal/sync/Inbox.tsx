import { EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { InboxAlert } from '../../../../server/protocol'
import { formatReceivedAt, nameOf } from '../counts'
import { fetchInbox, problemText, type SyncProblem } from './client'
import { getSyncStore } from './syncStore'
import styles from './SyncPage.module.css'

// Phase 2 (P2-C): the approved alerts for this laptop's municipality, read
// after each sync. Plain text, as a person approved it; nothing is stored.
// NEEDS DESIGN (TASKS.md P2-C): this section, on tokens meanwhile.

type Load =
  | { status: 'loading' }
  | { status: 'ready'; alerts: InboxAlert[]; checkedAt: string }
  | { status: 'problem'; problem: SyncProblem }

const KIND: Record<InboxAlert['kind'], string> = { 'doctor-team': 'Doctor team', 'move-stock': 'Stock move', watch: 'Watch window' }

export function InboxList({ alerts }: { alerts: InboxAlert[] }) {
  if (alerts.length === 0) return <p className={styles.note}>No approved alerts yet.</p>
  return (
    <ul className={styles.inbox}>
      {alerts.map((alert) => (
        <li key={alert.id}>
          <strong>
            {KIND[alert.kind]}, {nameOf(alert.barangay)}:
          </strong>{' '}
          {alert.text}
          <span className={styles.inboxMeta}>
            Approved by {alert.approvedByRole} · {formatReceivedAt(alert.approvedAt)} · week {alert.epiWeek}
          </span>
        </li>
      ))}
    </ul>
  )
}

// `refresh`: a number that changes after each sync, to read the inbox again.
export function Inbox({ refresh }: { refresh: number }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    let live = true
    void (async () => {
      const identity = await (await getSyncStore()).getIdentity()
      if (!identity) return
      const result = await fetchInbox(identity)
      if (!live) return
      setLoad(result.ok ? { status: 'ready', alerts: result.value.alerts, checkedAt: result.value.checkedAt } : { status: 'problem', problem: result.problem })
    })()
    return () => {
      live = false
    }
  }, [refresh])

  return (
    <section className={styles.card} aria-labelledby="inbox-heading">
      <h2 id="inbox-heading" className={styles.heading}>
        <EnvelopeSimpleIcon size={22} weight="bold" aria-hidden /> Inbox
      </h2>
      <p className={styles.lead}>Alerts from the provincial or DOH office, each approved by a person.</p>
      {load.status === 'loading' && <p className={styles.note}>Checking the inbox…</p>}
      {load.status === 'problem' && <p className={styles.note}>{problemText(load.problem).title}.</p>}
      {load.status === 'ready' && (
        <>
          <InboxList alerts={load.alerts} />
          <p className={styles.footnote}>Checked {formatReceivedAt(load.checkedAt)}</p>
        </>
      )}
    </section>
  )
}
