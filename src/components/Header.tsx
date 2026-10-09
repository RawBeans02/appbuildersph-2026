import { ArrowLeftIcon, ShieldCheckIcon, XIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { navigate } from '../app/router'
import { cx } from './cx'
import styles from './Header.module.css'
import { LocalStatus } from './LocalStatus'

// The main phone screens' header: title (h1), a place line, then LocalStatus.
// Home adds the shield button that opens Privacy & AI.
export function ScreenHeader({
  title,
  place,
  privacyButton,
  device = 'phone',
}: {
  title: ReactNode
  // E.g. "San Isidro Demo · Sample data" (see placeLine()).
  place?: ReactNode
  privacyButton?: boolean
  device?: 'phone' | 'laptop'
}) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {place && <p className={styles.place}>{place}</p>}
        <div className={styles.status}>
          <LocalStatus device={device} />
        </div>
      </div>
      {privacyButton && (
        <button type="button" className={styles.iconButton} aria-label="Privacy and AI" onClick={() => navigate('/privacy')}>
          <ShieldCheckIcon size={26} weight="bold" aria-hidden />
        </button>
      )}
    </header>
  )
}

// The flow top bar (56 px): back or close on the left, LocalStatus on the
// right, then the step text with a segmented step bar.
export function FlowTopBar({
  onBack,
  backKind = 'back',
  backLabel,
  step,
  dark,
  right,
}: {
  onBack: () => void
  // 'text': the label itself as a text button ("Cancel", "Stop").
  backKind?: 'back' | 'close' | 'text'
  // Screen-reader label: "Back", "Close" or "Cancel the check"; the visible
  // word for 'text'.
  backLabel?: string
  step?: { text: ReactNode; current: number; total: number }
  dark?: boolean
  // Replaces LocalStatus on the right when given.
  right?: ReactNode
}) {
  const BackIcon = backKind === 'close' ? XIcon : ArrowLeftIcon
  return (
    <div className={cx(dark && styles.dark, dark && 'on-night')}>
      <div className={styles.topBar}>
        {backKind === 'text' ? (
          <button type="button" className={styles.textButton} onClick={onBack}>
            {backLabel ?? 'Cancel'}
          </button>
        ) : (
          <button
            type="button"
            className={styles.iconButton}
            aria-label={backLabel ?? (backKind === 'close' ? 'Close' : 'Back')}
            onClick={onBack}
          >
            <BackIcon size={24} weight="bold" aria-hidden />
          </button>
        )}
        {right ?? <LocalStatus dark={dark} />}
      </div>
      {step && (
        <div className={styles.step}>
          <span>{step.text}</span>
          <span className={styles.segments} aria-hidden>
            {Array.from({ length: step.total }, (_, i) => (
              <span key={i} className={cx(styles.segment, i < step.current && styles.segmentOn)} />
            ))}
          </span>
        </div>
      )}
    </div>
  )
}
