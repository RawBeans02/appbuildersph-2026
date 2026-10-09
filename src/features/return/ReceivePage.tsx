import { CameraIcon, CheckCircleIcon, DownloadSimpleIcon, HouseIcon, InfoIcon, ScanIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useCallback, useId, useRef, useState, type MouseEvent } from 'react'
import { navigate } from '../../app/router'
import { useFlowMode } from '../../app/flow'
import { Button, ButtonLink, CheckLines, CheckRow, Field, FlowTopBar } from '../../components'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import { barangayName } from '../../data/places'
import { placeLine, usePlace } from '../../data/db/usePlace'
import { markJustReceived } from '../home/justReceived'
import { useQrScanner } from '../municipal/scan/useQrScanner'
import { Instructions } from './Instructions'
import { previewReceipt, saveReceipt } from './receipt'
import { receiveChecks, receiveChecksSpoken, receiveError } from './receiveCopy'
import styles from './Return.module.css'

// 21a: Receive RHU instructions (design pass 2, the minimum restyle). Read the
// return QR (camera, an image or pasted text), see the checks this phone ran
// and the instructions, compare the fingerprint the first time, then Save.

type Preview = Awaited<ReturnType<typeof previewReceipt>>

// Two groups a line ("5E21-9A0C" over "77B4-D31F"), never split inside one.
// The hyphen between the lines stays in the text, visually hidden, so the
// fingerprint still reads and copies whole.
function FingerprintLines({ value }: { value: string }) {
  const groups = value.split('-')
  const half = Math.ceil(groups.length / 2)
  return <>
    <span>{groups.slice(0, half).join('-')}</span>
    {groups.length > 1 && <span className="visually-hidden">-</span>}
    <span>{groups.slice(half).join('-')}</span>
  </>
}

// 21a·3: "Week 2026-W41 · 2 actions for Maligaya-D"
function savedLine({ packet }: Preview): string {
  const n = packet.actions.length
  return `Week ${packet.epiWeek} · ${n} ${n === 1 ? 'action' : 'actions'} for ${barangayName(packet.barangay) ?? packet.barangay}`
}

const CAMERA_OFF = ['denied', 'no-camera', 'unsupported', 'error']

export default function ReceivePage() {
  useFlowMode(true)
  const place = usePlace()
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [compared, setCompared] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<'saved' | 'duplicate' | null>(null)
  // Guards a double tap and a second scan while one is being checked.
  const working = useRef(false)
  const trustId = useId()
  const hintId = useId()
  const scanner = useQrScanner((value) => { void verify(value) })
  const view = saved ? 'saved' : preview ? 'preview' : 'read'

  // After a view change, its heading takes focus (and the page goes back to
  // the top), so a screen reader hears the new view. Not on first load.
  const viewChanged = useRef(false)
  const focusHeading = useCallback((node: HTMLElement | null) => {
    if (!node || !viewChanged.current) return
    window.scrollTo(0, 0)
    node.focus({ preventScroll: true })
  }, [])

  const fail = (cause: unknown, fallback: string) =>
    setError(receiveError(cause instanceof Error ? cause.message : fallback, place.barangay))

  async function verify(value: string) {
    if (working.current) return
    working.current = true; scanner.stop(); setError(''); setCompared(false)
    try {
      const checked = await previewReceipt(await getDb(), value)
      viewChanged.current = true
      setPreview(checked)
    } catch (cause) { fail(cause, "Couldn't check this return QR. Nothing was saved. Try again.") }
    finally { working.current = false }
  }
  async function image(file: File | undefined) {
    if (!file || working.current) return
    working.current = true; setError(''); scanner.stop()
    let value: string | null
    try { value = await scanner.decodeFile(file) } catch { value = null }
    finally { working.current = false }
    if (value) await verify(value)
    else setError('No readable QR found in this image. Try another image or paste the QR text.')
  }
  async function save() {
    if (!preview || working.current) return
    working.current = true; setError('')
    try {
      const result = await saveReceipt(await getDb(), preview, compared)
      viewChanged.current = true
      setSaved(result)
    } catch (cause) { fail(cause, "Couldn't save on this phone. Nothing was saved. Try again.") }
    finally { working.current = false }
  }
  function cancel() {
    viewChanged.current = true
    setPreview(null); setCompared(false); setError('')
  }
  // 1g: after a new save, Home shows the instructions row as just received
  // for that visit (a plain click; new-tab clicks stay with the browser).
  function backHome(event: MouseEvent<HTMLAnchorElement>) {
    if (saved !== 'saved' || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate('/')
    markJustReceived()
  }

  const where = placeLine([place.barangay], place.sample)
  const needsCompare = !!preview?.needsTrust && !compared
  const alert = error && <p role="alert" className={styles.alert}>
    <WarningCircleIcon size={22} weight="bold" aria-hidden />
    <span>{error}</span>
  </p>
  // The text twin of the checks and of the saved stamp (A4 rule 6).
  const spoken = saved === 'saved' ? 'Instructions saved on this phone.'
    : saved === 'duplicate' ? 'Already saved on this phone.'
    : preview ? receiveChecksSpoken(preview) : ''

  return <div className={styles.receive}>
    <FlowTopBar onBack={() => navigate('/send')} />
    <div className={styles.receiveBody}>
      <div className={styles.receiveHead}>
        {/* Keyed by view: a new view's heading mounts, and takes focus. */}
        <h1 key={view} ref={view === 'saved' ? undefined : focusHeading} tabIndex={-1} className={styles.receiveTitle}>
          Receive RHU instructions
        </h1>
        {where && <p className={styles.receivePlace}>{where}</p>}
        {view === 'read' && <p className={styles.purpose}>Instructions from the RHU laptop, checked on this phone.</p>}
      </div>

      {view === 'read' && <>
        <video ref={scanner.videoRef} className={styles.video} hidden={scanner.state.status === 'idle'} muted playsInline aria-label="Return QR camera preview" />
        {scanner.state.status !== 'idle' && !CAMERA_OFF.includes(scanner.state.status) && <div className={styles.center}>
          <Button variant="text" onClick={scanner.stop}>Stop camera</Button>
        </div>}
        <div className={styles.readActions}>
          {CAMERA_OFF.includes(scanner.state.status) && <p role="status" className={styles.note}>Camera unavailable. Choose an image or paste the QR text below.</p>}
          {alert}
          <Button tagalog="I-scan" icon={<ScanIcon size={22} weight="bold" aria-hidden />} onClick={() => void scanner.start()}>
            Scan the return QR
          </Button>
          <label className={styles.fileButton}>
            <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => { void image(e.target.files?.[0]); e.target.value = '' }} />
            <CameraIcon size={22} weight="bold" aria-hidden />
            Choose a QR image
          </label>
          <div className={styles.paste}>
            <Field label="Or paste the QR text">
              {(input) => <textarea {...input} className={cx(input.className, styles.pasteInput)} rows={3} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoCapitalize="off" autoComplete="off" />}
            </Field>
            <div className={styles.center}>
              <Button variant="text" disabled={!text.trim()} onClick={() => void verify(text)}>Check the pasted text</Button>
            </div>
          </div>
        </div>
      </>}

      {view === 'preview' && preview && <>
        <CheckLines lines={receiveChecks(preview)} animate />
        <Instructions packet={preview.packet} />
        {preview.needsTrust && <section className={styles.trust} aria-labelledby={trustId}>
          <h2 id={trustId} className={styles.trustTitle}>Compare with the RHU laptop</h2>
          <p>The first time, check that this code matches the one on the RHU laptop's screen.</p>
          <code className={styles.trustKey}><FingerprintLines value={preview.fingerprint} /></code>
          <CheckRow className={styles.trustRow} label="The fingerprint matches the RHU laptop" checked={compared} onChange={setCompared} />
        </section>}
      </>}

      {view === 'saved' && <div className={styles.done}>
        <span className={cx(styles.doneIcon, saved === 'saved' ? 'stamp' : styles.doneInfo)} aria-hidden>
          {saved === 'saved' ? <CheckCircleIcon size={34} weight="bold" /> : <InfoIcon size={34} weight="bold" />}
        </span>
        <h2 ref={focusHeading} tabIndex={-1} className={styles.doneTitle}>
          {saved === 'saved' ? 'Instructions saved on this phone' : 'Already saved on this phone'}
        </h2>
        {preview && <p className={styles.doneBody}>{savedLine(preview)}</p>}
      </div>}
    </div>

    {view === 'preview' && <div className={cx(styles.footer, styles.footerLine)}>
      {alert}
      {needsCompare && <p id={hintId} className={styles.saveHint}>Compare the fingerprint first.</p>}
      <Button tagalog="I-save" icon={<DownloadSimpleIcon size={22} weight="bold" aria-hidden />} disabled={needsCompare} aria-describedby={needsCompare ? hintId : undefined} onClick={() => void save()}>Save on this phone</Button>
      <div className={styles.center}>
        <Button variant="text" onClick={cancel}>Cancel preview</Button>
      </div>
    </div>}
    {view === 'saved' && <div className={styles.footer}>
      <ButtonLink to="/" tagalog="Bumalik sa Home" icon={<HouseIcon size={22} weight="bold" aria-hidden />} onClick={backHome}>Back to Home</ButtonLink>
    </div>}
    <p role="status" className="visually-hidden">{spoken}</p>
  </div>
}
