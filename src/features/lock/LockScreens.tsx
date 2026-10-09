import { EyeIcon, EyeSlashIcon, LockSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState, type FormEvent, type Ref } from 'react'
import { useFlowMode } from '../../app/flow'
// Straight from the files, not the components barrel (first-load chunk).
import { BottomSheet } from '../../components/BottomSheet'
import { Button } from '../../components/Button'
import { cx } from '../../components/cx'
import { Field, type FieldInputProps } from '../../components/Field'
import { RecordsError } from '../../components/StateBlock'
import { isValidPin } from '../../data/db/vault'
import type { LockView } from './lock'
import { lock, useLock } from './useLock'
import styles from './LockScreens.module.css'

// Phase 2's PIN screens (VITE_PHASE2), shown by App in place of every phone
// screen until the records are unlocked: opening the records, set a PIN,
// enter the PIN (with "Forgot the PIN?").
// NEEDS DESIGN: a stand-in built from the design system's tokens and shared
// components until Claude Design pass 2 designs these screens.

type LockedView = Extract<LockView, { status: 'locked' }>

const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, 6)

export default function LockScreens() {
  useFlowMode(true)
  const view = useLock()
  if (view.status === 'setup') return <SetupScreen busy={view.busy} />
  if (view.status === 'locked') return <LockedScreen view={view} />
  if (view.status === 'error') {
    return (
      <div className={styles.page}>
        <RecordsError onRetry={() => void lock.init()} />
      </div>
    )
  }
  if (view.status === 'checking') {
    return (
      <div className={styles.page}>
        <p role="status" className={styles.checking}>
          Opening the records…
        </p>
      </div>
    )
  }
  return null
}

// A PIN input with the show/hide toggle every password input gets
// (QUALITY.md). The toggle is named by its text, not aria-label, so the
// field's label stays the only label that matches "PIN".
function PinInput({
  input,
  name,
  inputRef,
  value,
  onChange,
  autoComplete,
}: {
  input: FieldInputProps
  name: string
  inputRef: Ref<HTMLInputElement>
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
}) {
  const [shown, setShown] = useState(false)
  return (
    <span className={styles.control}>
      <input
        {...input}
        ref={inputRef}
        className={cx(input.className, styles.pinInput)}
        type={shown ? 'text' : 'password'}
        inputMode="numeric"
        autoComplete={autoComplete}
        pattern="[0-9]*"
        maxLength={6}
        value={value}
        onChange={(event) => onChange(onlyDigits(event.target.value))}
      />
      <button type="button" className={styles.reveal} aria-pressed={shown} onClick={() => setShown((current) => !current)}>
        {shown ? <EyeSlashIcon size={24} weight="bold" aria-hidden /> : <EyeIcon size={24} weight="bold" aria-hidden />}
        <span className="visually-hidden">Show {name}</span>
      </button>
    </span>
  )
}

function Alert({ children }: { children: string }) {
  return (
    <p role="alert" className={styles.alert}>
      <WarningCircleIcon size={18} weight="bold" aria-hidden />
      {children}
    </p>
  )
}

function Heading({ children }: { children: string }) {
  return (
    <>
      <span className={styles.icon} aria-hidden>
        <LockSimpleIcon size={32} weight="bold" />
      </span>
      <h1 className={styles.title}>{children}</h1>
    </>
  )
}

function LockedScreen({ view }: { view: LockedView }) {
  const [pin, setPin] = useState('')
  // "Use 4 to 6 digits." for a PIN that can't be right (not counted as a try).
  const [formatError, setFormatError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // Read out after each try: the input may already have focus, so its
  // description alone wouldn't be announced again.
  const [announcement, setAnnouncement] = useState('')
  // The controller's waits are on performance.now(), so the device clock can't skip them.
  const [now, setNow] = useState(() => performance.now())
  const [forgetOpen, setForgetOpen] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [eraseFailed, setEraseFailed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  // The wrong-PIN wait: a tick each time the whole seconds left change, and
  // one at the end, which enables "Unlock" again.
  useEffect(() => {
    const until = view.waitUntil
    let timer: number | undefined
    const tick = () => {
      const time = performance.now()
      setNow(time)
      if (time < until) timer = window.setTimeout(tick, (until - time) % 1000 || 1000)
    }
    timer = window.setTimeout(tick, 0)
    return () => window.clearTimeout(timer)
  }, [view.waitUntil])

  const waitSeconds = Math.max(0, Math.ceil((view.waitUntil - now) / 1000))
  const waiting = waitSeconds > 0
  const tryError = [view.wrong ? 'Wrong PIN.' : null, waiting ? `Try again in ${waitSeconds} s.` : null].filter(Boolean).join(' ')
  const error = formatError ?? (tryError || null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (view.busy || waiting) return
    setFailed(false)
    setAnnouncement('')
    if (!isValidPin(pin)) {
      setFormatError('Use 4 to 6 digits.')
      setAnnouncement('Use 4 to 6 digits.')
      inputRef.current?.focus()
      return
    }
    setFormatError(null)
    try {
      const result = await lock.unlock(pin)
      // Unlocked: App swaps this screen for the app.
      if (result === 'ok') return
      const time = performance.now()
      setNow(time)
      const current = lock.getView()
      const until = current.status === 'locked' ? current.waitUntil : 0
      const wait = until > time ? ` Try again in ${Math.ceil((until - time) / 1000)} s.` : ''
      if (result === 'wrong') setPin('')
      setAnnouncement(result === 'wrong' ? `Wrong PIN.${wait}` : wait.trim())
      inputRef.current?.focus()
    } catch {
      setFailed(true)
      // Out of "Unlocking…" if the controller stopped mid-try.
      void lock.refresh().catch(() => undefined)
    }
  }

  const closeForget = useCallback(() => {
    setForgetOpen(false)
    setEraseFailed(false)
  }, [])

  async function erase() {
    setErasing(true)
    setEraseFailed(false)
    try {
      await lock.forget()
      setPin('')
      setFormatError(null)
      setFailed(false)
      setForgetOpen(false)
    } catch {
      setEraseFailed(true)
    } finally {
      setErasing(false)
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.form} noValidate onSubmit={(event) => void submit(event)}>
        <Heading>Enter your PIN</Heading>
        <div className={styles.fields}>
          <Field
            label="PIN"
            error={error}
            helper={
              view.demoPin ? (
                <>
                  Sample data PIN:{' '}
                  <span className={styles.demoPin} data-demo-pin>
                    {view.demoPin}
                  </span>
                </>
              ) : undefined
            }
          >
            {(input) => (
              <PinInput
                input={input}
                name="PIN"
                inputRef={inputRef}
                value={pin}
                autoComplete="current-password"
                onChange={(value) => {
                  setPin(value)
                  setFormatError(null)
                }}
              />
            )}
          </Field>
        </div>
        <div className={styles.actions}>
          {failed && <Alert>Couldn't open the records. Try again.</Alert>}
          <Button type="submit" disabled={view.busy || waiting}>
            {view.busy ? 'Unlocking…' : 'Unlock'}
          </Button>
          <div className={styles.secondary}>
            <Button variant="text" onClick={() => setForgetOpen(true)}>
              Forgot the PIN?
            </Button>
          </div>
        </div>
        <p role="status" className="visually-hidden">
          {announcement}
        </p>
      </form>

      <BottomSheet open={forgetOpen} onClose={closeForget} title="Erase the records on this phone?">
        <p className={styles.sheetText}>
          The records are locked with the PIN, so without it they can't be opened. This erases them. Downloaded AI and this
          phone's pairing stay.
        </p>
        {view.demoPin && <p className={styles.sheetText}>The sample data comes back, locked with the sample PIN.</p>}
        {eraseFailed && <Alert>Couldn't erase the records. Try again.</Alert>}
        <Button variant="destructive" disabled={erasing} onClick={() => void erase()}>
          {erasing ? 'Erasing the records…' : 'Erase the records'}
        </Button>
        <Button variant="text" onClick={closeForget}>
          Cancel
        </Button>
      </BottomSheet>
    </div>
  )
}

// A new PIN, twice: the first PIN on a phone (setup) and "Set your own PIN".
export function NewPinForm({
  busy,
  onSubmit,
  submitLabel,
  busyLabel,
  failText,
  heading,
  lead,
}: {
  busy: boolean
  onSubmit: (pin: string) => Promise<void>
  submitLabel: string
  busyLabel: string
  failText: string
  // The screen's h1 (setup); a sheet brings its own title.
  heading?: string
  lead: string
}) {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [againError, setAgainError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const pinRef = useRef<HTMLInputElement>(null)
  const againRef = useRef<HTMLInputElement>(null)

  useEffect(() => pinRef.current?.focus(), [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setFailed(false)
    setAnnouncement('')
    if (!isValidPin(pin)) {
      setPinError('Use 4 to 6 digits.')
      setAgainError(null)
      setAnnouncement('Use 4 to 6 digits.')
      pinRef.current?.focus()
      return
    }
    if (again !== pin) {
      setPinError(null)
      setAgainError("The two PINs don't match.")
      setAnnouncement("The two PINs don't match.")
      againRef.current?.focus()
      return
    }
    setPinError(null)
    setAgainError(null)
    try {
      await onSubmit(pin)
    } catch {
      // The alert reads it out.
      setFailed(true)
    }
  }

  return (
    <form className={styles.form} noValidate onSubmit={(event) => void submit(event)}>
      {heading && <Heading>{heading}</Heading>}
      <p className={styles.lead}>{lead}</p>
      <div className={styles.fields}>
        <Field label="PIN" error={pinError}>
          {(input) => (
            <PinInput
              input={input}
              name="PIN"
              inputRef={pinRef}
              value={pin}
              autoComplete="new-password"
              onChange={(value) => {
                setPin(value)
                setPinError(null)
              }}
            />
          )}
        </Field>
        <Field label="PIN again" error={againError}>
          {(input) => (
            <PinInput
              input={input}
              name="PIN again"
              inputRef={againRef}
              value={again}
              autoComplete="new-password"
              onChange={(value) => {
                setAgain(value)
                setAgainError(null)
              }}
            />
          )}
        </Field>
      </div>
      <div className={styles.actions}>
        {failed && <Alert>{failText}</Alert>}
        <Button type="submit" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
      <p role="status" className="visually-hidden">
        {announcement}
      </p>
    </form>
  )
}

function SetupScreen({ busy }: { busy: boolean }) {
  return (
    <div className={styles.page}>
      <NewPinForm
        busy={busy}
        heading="Set a PIN for this phone"
        lead="4 to 6 digits. It locks the records on this phone, and nobody can recover it if it's forgotten."
        submitLabel="Set the PIN"
        busyLabel="Locking the records…"
        failText="Couldn't lock the records. Try again."
        // Done: App swaps this screen for the app.
        onSubmit={(pin) => lock.setPin(pin)}
      />
    </div>
  )
}
