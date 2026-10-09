import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './Pill.module.css'

// Status pills, only for one record's status inside a list. Color + icon + word.
export type PillTone = 'ok' | 'warn' | 'bad' | 'neutral' | 'urgent'

export function Pill({ tone, icon, children }: { tone: PillTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cx(styles.pill, styles[tone])}>
      {icon}
      {children}
    </span>
  )
}
