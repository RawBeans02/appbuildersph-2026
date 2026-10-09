import { CheckCircleIcon, CloudSlashIcon, DeviceMobileIcon, LaptopIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from '../app/Link'
import { offlineModels } from '../lib/offlineModels'
import { useModelsPrepared } from '../lib/useModelsPrepared'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { cx } from './cx'
import styles from './LocalStatus.module.css'

// The local-AI indicator: one quiet line, icon + word, never a pill. "Runs on
// this phone" shows once the AI is ready; "Offline" joins it with no signal.
// Tapping either opens its sheet (L5, L7). On camera screens, pass dark.

export function LocalStatus({
  device = 'phone',
  dark,
  ready,
}: {
  device?: 'phone' | 'laptop'
  dark?: boolean
  // Override when the screen knows (the laptop's AI); otherwise the device's
  // models are checked in the model cache.
  ready?: boolean
}) {
  const online = useOnlineStatus()
  const prepared = useModelsPrepared(device)
  const [sheet, setSheet] = useState<'device' | 'offline' | null>(null)
  const isReady = ready ?? prepared === true
  if (!isReady) return null

  const DeviceIcon = device === 'laptop' ? LaptopIcon : DeviceMobileIcon
  const label = device === 'laptop' ? 'Runs on this laptop' : 'Runs on this phone'
  const models = offlineModels.filter((model) => model.device === device)

  return (
    <div className={cx(styles.status, dark && styles.dark)}>
      <button type="button" className={cx(styles.part, styles.device)} onClick={() => setSheet('device')}>
        <DeviceIcon size={16} weight="bold" aria-hidden />
        {label}
      </button>
      {!online && (
        <button type="button" className={cx(styles.part, styles.offline)} onClick={() => setSheet('offline')}>
          <CloudSlashIcon size={16} weight="bold" aria-hidden />
          Offline
        </button>
      )}

      <BottomSheet open={sheet === 'device'} onClose={() => setSheet(null)} title={label}>
        <p className={styles.sheetBody}>
          The AI is saved on this {device} and works with no signal. What you record stays here.
        </p>
        <ul className={styles.rows}>
          {models.map((model) => (
            <li key={`${model.id}@${model.version}`} className={styles.row}>
              {model.label}
              <span className={styles.ready}>
                <CheckCircleIcon size={18} weight="bold" aria-hidden />
                Ready
              </span>
            </li>
          ))}
        </ul>
        <Link to="/privacy" onClick={() => setSheet(null)}>
          What stays on this phone
        </Link>
      </BottomSheet>

      <BottomSheet open={sheet === 'offline'} onClose={() => setSheet(null)} title="Offline. Everything here still works.">
        <p className={styles.sheetBody}>
          Breathing checks, the watch list, stock and the QR all work with no signal. Only the first download and app
          updates need internet.
        </p>
        <Button onClick={() => setSheet(null)}>Got it</Button>
      </BottomSheet>
    </div>
  )
}
