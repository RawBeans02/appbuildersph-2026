import { useRef, useState } from 'react'
import { navigate } from '../../app/router'
import { useFlowMode } from '../../app/flow'
import { Button, ButtonLink, Field, FlowTopBar } from '../../components'
import { getDb } from '../../data/db/appDb'
import { placeLine, usePlace } from '../../data/db/usePlace'
import { useQrScanner } from '../municipal/scan/useQrScanner'
import { Instructions } from './Instructions'
import { previewReceipt, saveReceipt } from './receipt'
import styles from './Return.module.css'

export default function ReceivePage() {
  useFlowMode(true)
  const place = usePlace()
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewReceipt>> | null>(null)
  const [compared, setCompared] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<'saved' | 'duplicate' | null>(null)
  const working = useRef(false)
  const scanner = useQrScanner((value) => { void verify(value) })
  async function verify(value: string) {
    if (working.current) return
    working.current = true; setBusy(true); scanner.stop(); setError(''); setCompared(false)
    try { setPreview(await previewReceipt(await getDb(), value)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not verify this return QR. Nothing was saved.') }
    finally { working.current = false; setBusy(false) }
  }
  async function image(file: File | undefined) {
    if (!file || working.current) return
    working.current = true; setBusy(true); setError(''); scanner.stop()
    let value: string | null = null
    try {
      value = await scanner.decodeFile(file)
      if (!value) throw new Error('No QR found in this image. Try another image or paste the QR text.')
    } catch { setError('No readable QR found in this image. Try another image or paste the QR text.') }
    finally { working.current = false; setBusy(false) }
    if (value) await verify(value)
  }
  async function save() {
    if (!preview || working.current) return
    working.current = true; setBusy(true); setError('')
    try { setSaved(await saveReceipt(await getDb(), preview, compared)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save on this phone. Try again.') }
    finally { working.current = false; setBusy(false) }
  }
  return <div className={styles.screen}>
    <FlowTopBar onBack={() => navigate('/send')} />
    <h1 className={styles.title}>Receive RHU instructions</h1>
    <p className={styles.meta}>{placeLine([place.barangay], place.sample)}</p>
    {saved ? <>
      <div role="status"><h2>{saved === 'duplicate' ? 'Already saved on this phone' : 'Instructions saved on this phone'}</h2></div>
      <p>Available on Home after an offline reload.</p>
      <ButtonLink to="/">Back to Home</ButtonLink>
    </> : preview ? <>
      <p role="status">Signature verified. Review the instructions before saving.</p>
      <Instructions packet={preview.packet} />
      {preview.needsTrust && <section className={styles.trust} aria-label="First municipal trust">
        <h2>Compare with the RHU laptop</h2>
        <p>This signature proves possession of a key. Compare its fingerprint with the approving laptop to trust this municipality.</p>
        <code className={styles.fingerprint}>{preview.fingerprint}</code>
        <label className={styles.check}><input type="checkbox" checked={compared} onChange={(e) => setCompared(e.target.checked)} />The fingerprint matches the RHU laptop</label>
      </section>}
      <Button disabled={busy || (preview.needsTrust && !compared)} onClick={() => void save()}>Save instructions on this phone</Button>
      <Button variant="text" disabled={busy} onClick={() => { setPreview(null); setCompared(false); setError('') }}>Cancel preview</Button>
    </> : <>
      <p>Scan the return QR on the municipal laptop. Verification and saving work offline.</p>
      <video ref={scanner.videoRef} className={styles.video} hidden={scanner.state.status === 'idle'} muted playsInline aria-label="Return QR camera preview" />
      <Button disabled={busy || scanner.state.status === 'starting'} onClick={() => void scanner.start()}>Scan return QR with camera</Button>
      {scanner.state.status !== 'idle' && <Button variant="text" onClick={scanner.stop}>Stop camera</Button>}
      {['denied', 'no-camera', 'unsupported', 'error'].includes(scanner.state.status) && <p role="status">Camera unavailable. Choose an image or paste the QR text below.</p>}
      <label className={styles.file}>Choose a QR image<input type="file" accept="image/*" disabled={busy} onChange={(e) => { void image(e.target.files?.[0]); e.target.value = '' }} /></label>
      <Field label="Return QR text">{(input) => <textarea {...input} rows={4} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />}</Field>
      <Button variant="secondary" disabled={busy || !text.trim()} onClick={() => void verify(text)}>{busy ? 'Verifying…' : 'Verify return QR'}</Button>
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>
}
