import { CheckCircleIcon, InfoIcon, XCircleIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './CheckLines.module.css'

// The checks a device ran on a QR, in the order it ran them (design pass 2:
// 17g, 17h, 21a). A list stops at the line that failed: never show a check for
// a line that didn't run. `detail` is a mono line under the text (a key's
// fingerprint). With `animate`, the result icons wipe in together, once, because
// the checks just finished; the words never wait for it.
export type CheckLine = { status: 'ok' | 'failed' | 'info'; text: ReactNode; detail?: ReactNode }

const ICONS = { ok: CheckCircleIcon, failed: XCircleIcon, info: InfoIcon } as const
const SPOKEN = { ok: 'Passed: ', failed: 'Failed: ', info: '' } as const

export function CheckLines({ lines, animate = false, label }: { lines: CheckLine[]; animate?: boolean; label?: string }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {lines.map((line, i) => {
        const Icon = ICONS[line.status]
        return (
          <li key={i} className={styles.line}>
            <Icon className={cx(styles.icon, styles[line.status], animate && 'wipe')} size={22} weight="bold" aria-hidden />
            <span>
              {SPOKEN[line.status] && <span className="visually-hidden">{SPOKEN[line.status]}</span>}
              {line.text}
              {line.detail && <span className={styles.detail}>{line.detail}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
