import { CheckIcon, SparkleIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { Button, Field, Pill } from '../../components'
import { cx } from '../../components/cx'
import { DEMO_MUNICIPALITY } from '../../data/places'
import type { AiStatus, AlertView, AlertsResponse } from '../../../server/protocol'
import { formatReceivedAt, nameOf } from '../municipal/counts'
import { problemText, type SyncProblem } from '../municipal/sync/client'
import { aiLine, alertsApi, auditLine, factRows, isRole, kindLabel, sourceLine } from './alerts'
import styles from './AlertsPanel.module.css'

// Phase 2 alerts on the DOH view: draft from the synced facts (worded by
// GPT-6 Luna only when it's on and its wording passes the check), then a
// person approves or rejects each one by role. Approved alerts reach the
// laptop's and the barangay phones' inboxes.
// NEEDS DESIGN (TASKS.md P2-C): this panel, on tokens and shared components.

type Load = { status: 'loading' } | { status: 'ready'; data: AlertsResponse } | { status: 'problem'; problem: SyncProblem }

export function AlertsPanel({ code }: { code: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [drafting, setDrafting] = useState(false)
  const [problem, setProblem] = useState<SyncProblem | null>(null)
  const [role, setRole] = useState('')

  const apply = useCallback((result: Awaited<ReturnType<typeof alertsApi.list>>) => {
    setLoad(result.ok ? { status: 'ready', data: result.value } : { status: 'problem', problem: result.problem })
  }, [])

  useEffect(() => {
    let live = true
    alertsApi.list(code, DEMO_MUNICIPALITY.code).then((result) => live && apply(result))
    return () => {
      live = false
    }
  }, [code, apply])

  const reload = () => void alertsApi.list(code, DEMO_MUNICIPALITY.code).then(apply)

  async function draft() {
    setDrafting(true)
    setProblem(null)
    const result = await alertsApi.draft(code, DEMO_MUNICIPALITY.code)
    if (!result.ok) setProblem(result.problem)
    setDrafting(false)
    reload()
  }

  const ai: AiStatus | null = load.status === 'ready' ? load.data.ai : null
  const line = aiLine(ai)
  return (
    <section className={styles.panel} aria-labelledby="alerts-heading">
      <div className={styles.head}>
        <div>
          <h2 id="alerts-heading" className={styles.heading}>
            Draft alerts with GPT-6 Luna
          </h2>
          <p className={styles.lead}>
            Alerts are built from the synced counts by fixed rules. GPT-6 Luna (OpenAI, in the cloud) may reword them, seeing only
            those counts; a person approves every alert before it reaches the laptop and the barangay phones.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={drafting || load.status !== 'ready'}
          onClick={() => void draft()}
          icon={<SparkleIcon size={22} weight="bold" aria-hidden />}
        >
          {drafting ? 'Drafting…' : 'Draft alerts'}
        </Button>
      </div>
      <p className={cx(styles.ai, line.on && styles.aiOn)} data-ai={line.on ? 'on' : 'off'}>
        {load.status === 'loading' ? 'Checking whether GPT-6 Luna is on…' : line.text}
      </p>
      {problem && <ProblemLine problem={problem} />}
      {load.status === 'problem' && load.problem.kind !== 'unreachable' && <ProblemLine problem={load.problem} />}

      {load.status === 'ready' && (
        <>
          {load.data.drafts.length > 0 && (
            <div className={styles.role}>
              <Field label="Your role (not your name)" helper="Saved with each decision, e.g. Provincial health officer.">
                {(input) => <input {...input} value={role} autoComplete="organization-title" onChange={(event) => setRole(event.target.value)} />}
              </Field>
            </div>
          )}
          {load.data.drafts.length === 0 ? (
            <p className={styles.note}>No drafts waiting. "Draft alerts" builds them from the latest synced reports.</p>
          ) : (
            <ol className={styles.list}>
              {load.data.drafts.map((alert) => (
                <DraftCard key={alert.id} alert={alert} code={code} role={role} onDone={reload} />
              ))}
            </ol>
          )}
          {load.data.decided.length > 0 && (
            <>
              <h3 className={styles.subheading}>Decided</h3>
              <ul className={styles.decided}>
                {load.data.decided.map((alert) => (
                  <li key={alert.id}>
                    <Pill tone={alert.status === 'approved' ? 'ok' : 'neutral'}>{alert.status === 'approved' ? 'Approved' : 'Rejected'}</Pill>{' '}
                    <strong>
                      {kindLabel(alert.kind)}, {nameOf(alert.barangay)}:
                    </strong>{' '}
                    {alert.text}
                    <span className={styles.meta}>
                      {alert.decidedByRole} · {alert.decidedAt ? formatReceivedAt(alert.decidedAt) : ''} · {sourceLine(alert).tag}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {load.data.audit.length > 0 && (
            <>
              <h3 className={styles.subheading}>Audit log</h3>
              <ul className={styles.audit}>
                {load.data.audit.map((entry, i) => (
                  <li key={`${entry.at}-${i}`}>{auditLine(entry)}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}

function ProblemLine({ problem }: { problem: SyncProblem }) {
  const { title, body } = problemText(problem)
  return (
    <p role="alert" className={styles.problem}>
      <WarningCircleIcon size={20} weight="bold" aria-hidden />
      <span>
        <strong>{title}.</strong> {body}
      </span>
    </p>
  )
}

export function DraftCard({ alert, code, role, onDone }: { alert: AlertView; code: string; role: string; onDone: () => void }) {
  const [text, setText] = useState(alert.text)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<SyncProblem | null>(null)
  const source = sourceLine(alert)
  const roleOk = isRole(role.trim())

  async function decide(approve: boolean) {
    setBusy(true)
    setProblem(null)
    const edited = text.trim() !== alert.text.trim()
    const result = approve
      ? await alertsApi.approve(code, alert.id, role.trim(), edited ? text.trim() : null)
      : await alertsApi.reject(code, alert.id, role.trim())
    setBusy(false)
    if (result.ok || result.problem.kind === 'already-decided' || result.problem.kind === 'superseded') onDone()
    else setProblem(result.problem)
  }

  const textId = `alert-text-${alert.id}`
  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>
          {kindLabel(alert.kind)} · {nameOf(alert.barangay)}
        </h3>
        <Pill tone="neutral">{source.tag}</Pill>
      </div>
      <dl className={styles.facts}>
        {factRows(alert).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <label htmlFor={textId} className={styles.textLabel}>
        Wording (edit before approving; an edited wording is checked against the facts again)
      </label>
      <textarea id={textId} className={styles.text} rows={4} value={text} onChange={(event) => setText(event.target.value)} />
      <p className={styles.check}>{source.line}</p>
      {problem && <ProblemLine problem={problem} />}
      <div className={styles.actions}>
        <Button disabled={busy || !roleOk || text.trim() === ''} onClick={() => void decide(true)} icon={<CheckIcon size={22} weight="bold" aria-hidden />}>
          Approve
        </Button>
        <Button variant="secondary" disabled={busy || !roleOk} onClick={() => void decide(false)} icon={<XIcon size={22} weight="bold" aria-hidden />}>
          Reject
        </Button>
        {!roleOk && <span className={styles.hint}>Type your role above to decide.</span>}
      </div>
    </li>
  )
}
