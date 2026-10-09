import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './Pill.module.css'

// Status pills, only for one record's status inside a list. Color + icon + word.
export type PillTone = 'ok' | 'warn' | 'bad' | 'neutral' | 'urgent'

// onTint: the pill sits on a row of its own tint (a --warn-tint row), so it
// takes --surface to keep its edge.
export function Pill({ tone, icon, onTint, children }: { tone: PillTone; icon?: ReactNode; onTint?: boolean; children: ReactNode }) {
  return (
    <span className={cx(styles.pill, styles[tone], onTint && styles.onTint)}>
      {icon}
      {children}
    </span>
  )
}
