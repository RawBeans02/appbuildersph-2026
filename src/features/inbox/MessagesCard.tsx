import { EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { getDb } from '../../data/db/appDb'
import { useOnlineStatus } from '../../lib/useOnlineStatus'
import type { InboxAlert } from '../../../server/protocol'
import { formatReceivedAt } from '../municipal/counts'
import { fetchInbox } from '../municipal/sync/client'
import styles from './MessagesCard.module.css'

// Phase 2 (P2-C) on the phone's Home: when online, the alerts a person
// approved for this barangay, pulled with a request signed by this phone's
// own key (the one it paired with). Plain text; nothing is stored. Offline,
// the card isn't shown.
// NEEDS DESIGN (TASKS.md P2-C): this card, on tokens meanwhile.

type Load =
  | { status: 'loading' }
  | { status: 'not-paired' }
  | { status: 'not-linked' }
  | { status: 'unavailable' }
  | { status: 'ready'; alerts: InboxAlert[]; checkedAt: string }

export default function MessagesCard() {
  const online = useOnlineStatus()
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    if (!online) return
    let live = true
    void (async () => {
      const identity = await (await getDb()).getDeviceIdentity().catch(() => null)
      const next: Load = !identity
        ? { status: 'not-paired' }
        : await fetchInbox(identity).then((result): Load => {
            if (result.ok) return { status: 'ready', alerts: result.value.alerts, checkedAt: result.value.checkedAt }
            return result.problem.kind === 'not-registered' ? { status: 'not-linked' } : { status: 'unavailable' }
          })
      if (live) setLoad(next)
    })()
    return () => {
      live = false
    }
  }, [online])

  if (!online) return null
  return <MessagesView load={load} />
}

export function MessagesView({ load }: { load: Load }) {
  return (
    <section className={styles.card} aria-labelledby="messages-heading">
      <h2 id="messages-heading" className={styles.title}>
        <EnvelopeSimpleIcon size={20} weight="bold" aria-hidden />
        Messages from the municipality
      </h2>
      {load.status === 'loading' && <p className={styles.note}>Checking for messages…</p>}
      {load.status === 'not-paired' && <p className={styles.note}>Messages appear here once this phone is paired with the municipal laptop.</p>}
      {load.status === 'not-linked' && (
        <p className={styles.note}>Not linked yet: messages appear after the municipal laptop syncs this phone's pairing.</p>
      )}
      {load.status === 'unavailable' && <p className={styles.note}>Couldn't check for messages. Everything else works as before.</p>}
      {load.status === 'ready' && (
        <>
          {load.alerts.length === 0 ? (
            <p className={styles.note}>No messages.</p>
          ) : (
            <ul className={styles.list}>
              {load.alerts.map((alert) => (
                <li key={alert.id}>
                  {alert.text}
                  <span className={styles.meta}>
                    Approved by {alert.approvedByRole} · {formatReceivedAt(alert.approvedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.checked}>Checked {formatReceivedAt(load.checkedAt)}</p>
        </>
      )}
    </section>
  )
}
