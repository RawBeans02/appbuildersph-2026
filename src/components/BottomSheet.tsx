import { XIcon } from '@phosphor-icons/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './BottomSheet.module.css'

// A bottom sheet over the screen: top radius 24, a grabber, scrim behind.
// Escape or a tap on the scrim closes it; focus moves in and back out.
// Dismissible sheets (L5, L7, 9b) also show a 48 px Close top right. The
// title is an h2, or the screen's h1 when the sheet is the whole screen.
export function BottomSheet({
  open,
  onClose,
  title,
  icon,
  iconTone = 'neutral',
  showClose,
  titleLevel = 'h2',
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  // A Phosphor icon element (32 px, Bold), shown in a 64 px circle above
  // the title: --sunken, or --warn-tint with a --warn icon for 'warn'.
  icon?: ReactNode
  iconTone?: 'neutral' | 'warn'
  showClose?: boolean
  titleLevel?: 'h1' | 'h2'
  children: ReactNode
}) {
  const Title = titleLevel
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const sheet = sheetRef.current
    const first = sheet?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ;(first ?? sheet)?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className={styles.scrim} onClick={onClose}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.grabber} aria-hidden />
        {icon && (
          <span className={iconTone === 'warn' ? `${styles.icon} ${styles.iconWarn}` : styles.icon} aria-hidden>
            {icon}
          </span>
        )}
        <div className={styles.head}>
          <Title id={titleId} className={styles.title}>
            {title}
          </Title>
          {showClose && (
            <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
              <XIcon size={24} weight="bold" aria-hidden />
            </button>
          )}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
