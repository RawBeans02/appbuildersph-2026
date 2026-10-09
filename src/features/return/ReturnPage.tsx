import { useCallback, useState } from 'react'
import { Button, ButtonLink, Field } from '../../components'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import { useDbQuery } from '../../data/db/useDbQuery'
import { LaptopFrame } from '../municipal/LaptopFrame'
import { getSyncStore } from '../municipal/sync/syncStore'
import { QrImage } from '../send/QrImage'
import { useWakeLock } from '../send/wakeLock'
import { Instructions } from './Instructions'
import { actionsFor, makeReturnQr, readReturnApproval } from './sender'
import styles from './Return.module.css'

export default function ReturnPage() {
  const id = new URLSearchParams(window.location.search).get('approval') ?? ''
  const read = useCallback((db: Awaited<ReturnType<typeof getDb>>) => readReturnApproval(db, id), [id])
  const data = useDbQuery(['approvals', 'plans'], read)
  const [barangay, setBarangay] = useState('')
  const [qr, setQr] = useState<Awaited<ReturnType<typeof makeReturnQr>> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useWakeLock(!!qr)
  const recipients = data.status === 'ready' ? data.data.plan.rows.filter((row) => actionsFor(data.data.plan, row.barangay).length > 0) : []
  const selected = barangay || recipients[0]?.barangay || ''
  async function make() {
    if (busy) return
    setBusy(true); setError(''); setQr(null)
    try { setQr(await makeReturnQr(await getDb(), await getSyncStore(), id, selected)) }
    catch { setError('Could not make a return QR from this saved approval. Try again or use the proven reporting flow.') }
    finally { setBusy(false) }
  }
  return <LaptopFrame active="plan" title="Return instructions QR"><div className={styles.screen}>
    <ButtonLink to="/municipal/log" variant="text">Back to approval log</ButtonLink>
    {data.status === 'loading' && <p role="status">Opening the saved approval…</p>}
    {data.status === 'error' && <p role="alert" className={styles.error}>This saved approval cannot be opened.</p>}
    {data.status === 'ready' && <>
      <p className={styles.meta}>Saved approval · Week {data.data.plan.epiWeek} · Synthetic sample data</p>
      <p>Only approved structured actions relevant to the selected barangay are included.</p>
      {recipients.length === 0 ? <p className={styles.empty}>No doctor-team or stock-transfer actions apply to this approval.</p> : <>
        <Field label="Recipient barangay">{(input) => <select {...input} value={selected} disabled={busy} onChange={(e) => { setBarangay(e.target.value); setQr(null) }}>{recipients.map((row) => <option key={row.barangay} value={row.barangay}>{row.name}</option>)}</select>}</Field>
        <Button disabled={busy} onClick={() => void make()}>{busy ? 'Making the QR…' : 'Generate return QR'}</Button>
      </>}
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {qr && <>
      <Instructions packet={qr.packet} />
      {/* 22a: the QR plays `reveal` once, as it is made, then stays still. */}
      <div className={cx(styles.qr, 'reveal-qr')}><QrImage text={qr.text} label="Approved return instructions QR" /></div>
      <p>On the barangay phone, open Receive RHU instructions. Before first trust, compare this fingerprint:</p>
      <code className={styles.fingerprint}>{qr.fingerprint}</code>
      <p className={styles.meta}>Approval ID: {qr.packet.approvalId}. Hold the laptop steady and raise the brightness if needed.</p>
    </>}
  </div></LaptopFrame>
}
