import type { ReactNode } from 'react'
import styles from './Progress.module.css'

// Progress: a 14 px track, ink fill, always with a text label and MB / %.
// value null = indeterminate (a sliding 30% segment; a pulse under reduced motion).
export function Progress({ value, label, detail }: { value: number | null; label: ReactNode; detail?: ReactNode }) {
  const percent = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={styles.progress}>
      <div className={styles.labels}>
        <span>{label}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        {percent === null ? (
          <div className={`${styles.indeterminate} motion-safe`} />
        ) : (
          <div className={styles.fill} style={{ width: `${percent}%` }} />
        )}
      </div>
    </div>
  )
}
