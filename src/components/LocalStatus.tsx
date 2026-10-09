import { ArrowRightIcon, CheckCircleIcon, CloudSlashIcon, DeviceMobileIcon, LaptopIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from '../app/Link'
import { partsWithModels } from '../lib/modelParts'
import { offlineModels } from '../lib/offlineModels'
import { useModelsPrepared } from '../lib/useModelsPrepared'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { cx } from './cx'
import styles from './LocalStatus.module.css'

// The local-AI indicator: one quiet line, icon + word, never a pill. "Runs on
// this phone" shows once the AI is ready; "Offline" joins it with no signal.
// Each is a button with a dotted underline that opens its sheet (L5, L7),
// with a 48 px tap area that doesn't move the 20 px line (negative margin).
// On camera screens, pass dark.

export function LocalStatus({
  device = 'phone',
  dark,
  stacked,
  ready,
}: {
  device?: 'phone' | 'laptop'
  dark?: boolean
  // The two parts one above the other (the laptop's sidebar, LaptopNav).
  stacked?: boolean
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
  const parts = partsWithModels(offlineModels.filter((model) => model.device === device))

  return (
    <div className={cx(styles.status, dark && styles.dark, stacked && styles.stacked)}>
      <button type="button" aria-haspopup="dialog" className={cx(styles.part, styles.device)} onClick={() => setSheet('device')}>
        <DeviceIcon size={16} weight="bold" aria-hidden />
        <span className={styles.word}>{label}</span>
      </button>
      {!online && (
        <button type="button" aria-haspopup="dialog" className={cx(styles.part, styles.offline)} onClick={() => setSheet('offline')}>
          <CloudSlashIcon size={16} weight="bold" aria-hidden />
          <span className={styles.word}>Offline</span>
        </button>
      )}

      <BottomSheet
        open={sheet === 'device'}
        onClose={() => setSheet(null)}
        showClose
        title={
          <span className={styles.sheetTitle}>
            <span className={styles.sheetIcon} aria-hidden>
              <DeviceIcon size={26} weight="bold" />
            </span>
            {label}
          </span>
        }
      >
        <p className={styles.sheetBody}>
          The AI is saved on this {device} and works with no signal. Your records stay here.
          {device === 'phone' && ' Only counts leave, in the QR.'}
        </p>
        <ul className={styles.rows}>
          {parts.map((part) => (
            <li key={part.key} className={styles.row}>
              {part.title}
              <span className={styles.ready}>
                <CheckCircleIcon size={18} weight="bold" aria-hidden />
                Ready
              </span>
            </li>
          ))}
        </ul>
        <Link to="/privacy" className={styles.more} onClick={() => setSheet(null)}>
          What stays on this phone
          <ArrowRightIcon size={20} weight="bold" aria-hidden />
        </Link>
      </BottomSheet>

      <BottomSheet open={sheet === 'offline'} onClose={() => setSheet(null)} showClose
        title={
          <span className={styles.sheetTitle}>
            <span className={cx(styles.sheetIcon, styles.sheetIconOffline)} aria-hidden>
              <CloudSlashIcon size={26} weight="bold" />
            </span>
            Offline. Everything here still works.
          </span>
        }
      >
        <p className={styles.sheetBody}>
          Breathing checks, the watch list, stock and the QR all work with no signal. Only the first download and app
          updates need internet.
        </p>
        <Button onClick={() => setSheet(null)}>Got it</Button>
      </BottomSheet>
    </div>
  )
}
