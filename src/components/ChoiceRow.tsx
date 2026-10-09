import { CheckIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import styles from './ChoiceRow.module.css'
import { cx } from './cx'

// Checkbox and radio rows: the whole row is the target (min 58 px). Checked =
// ink fill and a bold label, so the state also shows in weight.

type RowProps = {
  label: ReactNode
  meta?: ReactNode
  checked: boolean
  disabled?: boolean
  className?: string
}

export function CheckRow({ label, meta, checked, disabled, className, onChange }: RowProps & { onChange(checked: boolean): void }) {
  return (
    <label className={cx(styles.row, checked && styles.checked, className)}>
      <input
        type="checkbox"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.box} aria-hidden>
        {checked && <CheckIcon size={20} weight="bold" />}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
    </label>
  )
}

export function RadioRow({
  label,
  meta,
  checked,
  disabled,
  className,
  name,
  value,
  onSelect,
}: RowProps & { name: string; value: string; onSelect(value: string): void }) {
  return (
    <label className={cx(styles.row, checked && styles.checked, className)}>
      <input
        type="radio"
        className={styles.input}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
      />
      <span className={cx(styles.box, styles.radio)} aria-hidden>
        {checked && <span className={styles.dot} />}
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
    </label>
  )
}
