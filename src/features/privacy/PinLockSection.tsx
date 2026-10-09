import { LockSimpleIcon } from '@phosphor-icons/react'
import { lazy, Suspense, useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Button } from '../../components/Button'
import { lock, useLock } from '../lock/useLock'
import styles from './PrivacyPage.module.css'

// Phase 2's PIN lock on Privacy & AI: "Lock now", and "Set your own PIN"
// while the records are opened with the sample data PIN. Shown only when the
// lock is on and open. NEEDS DESIGN (pass 2): a stand-in on tokens and the
// shared components.

const NewPinForm = lazy(() => import('../lock/LockScreens').then((module) => ({ default: module.NewPinForm })))

export function PinLockSection() {
  const view = useLock()
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  if (view.status !== 'unlocked') return null

  async function change(pin: string) {
    setBusy(true)
    try {
      await lock.changePin(pin)
      setChanging(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2 className={styles.heading}>PIN lock</h2>
      <p className={styles.text}>
        Names, birth dates, households and health details are locked on this phone with the PIN. AgapayMo locks again after 5
        minutes in the background.
      </p>
      <div className={styles.lockActions}>
        <Button variant="secondary" icon={<LockSimpleIcon size={22} weight="bold" aria-hidden />} onClick={() => void lock.lockNow()}>
          Lock now
        </Button>
        {view.usingDemoPin && (
          <Button variant="text" onClick={() => setChanging(true)}>
            Set your own PIN
          </Button>
        )}
      </div>
      <BottomSheet open={changing} onClose={() => setChanging(false)} showClose title="Set your own PIN">
        <Suspense fallback={null}>
          <NewPinForm
            busy={busy}
            lead="4 to 6 digits. The records are locked again with it, and the sample PIN stops working. Nobody can recover it if it's forgotten."
            submitLabel="Set the PIN"
            busyLabel="Locking the records again…"
            failText="Couldn't set the PIN. The old one still works. Try again."
            onSubmit={change}
          />
        </Suspense>
      </BottomSheet>
    </>
  )
}
