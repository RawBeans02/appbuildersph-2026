import { CheckCircleIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react'
import { cx } from '../../components/cx'
import type { ResultKind } from './copy'
import styles from './ResultBand.module.css'

// The Hinga result band (design/README.md, "Hinga result band"): color, icon
// and word together, following the IMCI chart. Amber = refer (fast), red =
// URGENT, green = not fast. Only Hinga uses it, so it lives here (TASKS.md,
// under A7, asks whether it should move to src/components).
const ICONS = { fast: WarningIcon, urgent: WarningCircleIcon, 'not-fast': CheckCircleIcon } as const

// perMin is null for the danger signs checked without a count: no number then.
export function ResultBand({ kind, label, perMin, line }: { kind: ResultKind; label: string; perMin: number | null; line: string }) {
  const Icon = ICONS[kind]
  return (
    <section className={cx(styles.band, styles[kind])} role={kind === 'urgent' ? 'alert' : undefined} aria-label={label}>
      <p className={styles.label}>
        <Icon size={20} weight="bold" aria-hidden />
        {label}
      </p>
      {perMin !== null && (
        <p className={styles.reading}>
          <span className={styles.metric}>{perMin}</span>
          <span className={styles.unit}>breaths a minute</span>
        </p>
      )}
      <p className={styles.line}>{line}</p>
    </section>
  )
}
