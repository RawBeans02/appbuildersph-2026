import { CheckCircleIcon, CloudArrowUpIcon, CloudSlashIcon, KeyIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, Field, StateBlock } from '../../../components'
import { cx } from '../../../components/cx'
import { getDb } from '../../../data/db/appDb'
import { useOnlineStatus } from '../../../lib/useOnlineStatus'
import type { HealthResponse } from '../../../../server/protocol'
import { formatReceivedAt } from '../counts'
import { LaptopFrame } from '../LaptopFrame'
import { Inbox } from './Inbox'
import { registerLaptop, syncNow } from './actions'
import { problemText, readHealth, type SyncProblem } from './client'
import { SecretInput } from './SecretInput'
import { getSyncStore, type Enrollment, type LastSync } from './syncStore'
import styles from './SyncPage.module.css'

// Phase 2 (VITE_PHASE2): when the internet returns, the laptop registers once
// and then uploads what it already holds. Offline, it waits; nothing else on
// the laptop depends on it.
// NEEDS DESIGN (TASKS.md P2-B): this screen, built on the tokens and shared
// components until Claude Design pass 2.

type Saved = { enrollment: Enrollment | null; fingerprint: string | null; last: LastSync | null }

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; saved: Saved }

async function readSaved(): Promise<Saved> {
  const store = await getSyncStore()
  const [enrollment, identity, last] = await Promise.all([store.getEnrollment(), store.getIdentity(), store.getLastSync()])
  return { enrollment, fingerprint: identity?.fingerprint ?? null, last }
}

const serverReady = (health: HealthResponse) => health.database.configured && health.enrollConfigured

export default function SyncPage() {
  const online = useOnlineStatus()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  // undefined while asking; null when the server couldn't be reached.
  const [health, setHealth] = useState<HealthResponse | null | undefined>(undefined)
  // Goes up after each sync, so the inbox is read again.
  const [synced, setSynced] = useState(0)

  const reload = useCallback(async () => {
    try {
      setLoad({ status: 'ready', saved: await readSaved() })
    } catch {
      setLoad({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    let live = true
    readSaved().then(
      (saved) => live && setLoad({ status: 'ready', saved }),
      () => live && setLoad({ status: 'error' }),
    )
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!online) return
    let live = true
    readHealth().then((result) => live && setHealth(result))
    return () => {
      live = false
    }
  }, [online])

  const saved = load.status === 'ready' ? load.saved : null
  return (
    <LaptopFrame
      active="sync"
      title="Sync"
      sub="Optional. When there's internet, sends the barangay counts on this laptop to the regional view."
    >
      <div className={styles.page}>
        {load.status === 'loading' && <p className={styles.note}>Opening the records on this laptop…</p>}
        {load.status === 'error' && (
          <StateBlock tone="error" icon={WarningCircleIcon} title="Couldn't open the sync records" body="Nothing was lost. Your records are still saved on this laptop.">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </StateBlock>
        )}
        {saved &&
          (!online ? (
            <StateBlock icon={CloudSlashIcon} title="Sync waits for internet." body="Everything else works offline." />
          ) : health && !serverReady(health) ? (
            <StateBlock icon={CloudSlashIcon} title="Sync isn't set up on the server yet" body="Everything else works offline, as before." />
          ) : saved.enrollment ? (
            <SyncCard
              saved={saved}
              onDone={() => {
                void reload()
                setSynced((count) => count + 1)
              }}
            />
          ) : (
            <RegisterCard onDone={() => void reload()} />
          ))}
        {saved?.last && <LastSyncTable last={saved.last} />}
        {online && saved?.enrollment && <Inbox refresh={synced} />}
        <p className={styles.footnote}>
          Sync sends the paired phones' public keys and the barangay QRs exactly as received: counts only, with small numbers
          as “&lt;5”. No names, birthdays or addresses are on this laptop to send.
        </p>
      </div>
    </LaptopFrame>
  )
}

function Problem({ problem }: { problem: SyncProblem }) {
  const { title, body } = problemText(problem)
  return (
    <div role="alert" className={styles.problem}>
      <WarningCircleIcon size={22} weight="bold" aria-hidden />
      <p>
        <strong>{title}.</strong> {body}
      </p>
    </div>
  )
}

function RegisterCard({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<SyncProblem | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || code.trim() === '') return
    setBusy(true)
    setProblem(null)
    try {
      const result = await registerLaptop(await getSyncStore(), code.trim())
      if (result.ok) {
        setCode('')
        onDone()
      } else {
        setProblem(result.problem)
      }
    } catch {
      setProblem({ kind: 'failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.card} aria-labelledby="register-heading">
      <h2 id="register-heading" className={styles.heading}>
        Register this laptop
      </h2>
      <p className={styles.lead}>
        Once, with the enroll code from whoever set up AgapayMo. This laptop makes its own key, which never leaves it; the code
        isn't kept here.
      </p>
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <Field label="Enroll code" error={problem?.kind === 'wrong-code' ? problemText(problem).title : null}>
          {(input) => <SecretInput input={input} name="enroll code" value={code} onChange={setCode} />}
        </Field>
        {problem && problem.kind !== 'wrong-code' && <Problem problem={problem} />}
        <div className={styles.actions}>
          <Button type="submit" disabled={busy || code.trim() === ''} icon={<KeyIcon size={22} weight="bold" aria-hidden />}>
            {busy ? 'Registering…' : 'Register this laptop'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function SyncCard({ saved, onDone }: { saved: Saved; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<SyncProblem | null>(null)

  async function run() {
    setBusy(true)
    setProblem(null)
    try {
      const result = await syncNow(await getDb(), await getSyncStore())
      if (!result.ok) setProblem(result.problem)
      onDone()
    } catch {
      setProblem({ kind: 'failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.card} aria-labelledby="sync-heading">
      <h2 id="sync-heading" className={styles.heading}>
        This laptop is registered
      </h2>
      <p className={styles.lead}>
        Laptop key <span className={styles.fingerprint}>{saved.enrollment?.fingerprint ?? saved.fingerprint}</span>
      </p>
      <p className={styles.status} role="status">
        {busy ? 'Syncing…' : saved.last ? `Last synced ${formatReceivedAt(saved.last.at)}` : 'Not synced yet'}
      </p>
      {problem && <Problem problem={problem} />}
      <div className={styles.actions}>
        <Button disabled={busy} onClick={() => void run()} icon={<CloudArrowUpIcon size={22} weight="bold" aria-hidden />}>
          Sync now
        </Button>
      </div>
    </section>
  )
}

export function LastSyncTable({ last }: { last: LastSync }) {
  return (
    <section className={styles.results} aria-labelledby="results-heading">
      <h2 id="results-heading" className={styles.heading}>
        Last sync, by barangay
      </h2>
      <p className={styles.lead}>{formatReceivedAt(last.at)}</p>
      {last.rows.length === 0 ? (
        <p className={styles.note}>Nothing to send yet: no phone is paired and no barangay QR was received.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Barangay</th>
              <th scope="col">Phone key</th>
              <th scope="col">Report</th>
            </tr>
          </thead>
          <tbody>
            {last.rows.map((row) => (
              <tr key={row.barangay}>
                <th scope="row">{row.name}</th>
                <td>{row.key}</td>
                <td>
                  <span className={cx(styles.result, row.tone === 'bad' ? styles.bad : styles.ok)}>
                    {row.tone === 'bad' ? (
                      <WarningCircleIcon size={18} weight="bold" aria-hidden />
                    ) : (
                      <CheckCircleIcon size={18} weight="bold" aria-hidden />
                    )}
                    {row.report}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
