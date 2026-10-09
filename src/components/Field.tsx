import { CheckIcon, EyeIcon, EyeSlashIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useId, type ReactNode } from 'react'
import { cx } from './cx'
import styles from './Field.module.css'

// A labeled field (label above, never a placeholder label). The input itself
// is rendered by the caller with the props given, so any input, select or
// textarea gets the same look and wiring.

export type FieldTag = 'sure' | 'check' | 'not-read'

export type FieldInputProps = {
  id: string
  className: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

const TAGS: Record<FieldTag, { text: string; icon: ReactNode; className: string }> = {
  sure: { text: 'Sure', icon: <CheckIcon size={16} weight="bold" aria-hidden />, className: styles.tagSure },
  check: { text: 'Please check', icon: <EyeIcon size={16} weight="bold" aria-hidden />, className: styles.tagCheck },
  'not-read': { text: 'Not read', icon: <EyeSlashIcon size={16} weight="bold" aria-hidden />, className: styles.tagCheck },
}

export function Field({
  label,
  optional,
  tag,
  helper,
  error,
  trailingIcon,
  children,
}: {
  label: ReactNode
  optional?: boolean
  // The box reader's confidence tag.
  tag?: FieldTag
  helper?: ReactNode
  error?: string | null
  // An icon at the input's right edge, e.g. a select's CaretDownIcon (20 px,
  // Bold); the native arrow is hidden. Purely visual.
  trailingIcon?: ReactNode
  children: (input: FieldInputProps) => ReactNode
}) {
  const id = useId()
  const helperId = `${id}-helper`
  const errorId = `${id}-error`
  const flagged = tag === 'check' || tag === 'not-read'
  const describedBy = [helper ? helperId : null, error ? errorId : null].filter(Boolean).join(' ')
  const tagInfo = tag ? TAGS[tag] : null
  const inputProps: FieldInputProps = {
    id,
    className: cx(styles.input, flagged && styles.check, error && styles.invalid),
    ...(error ? { 'aria-invalid': true as const } : {}),
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
  }
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
          {optional && <span className={styles.optional}> (optional)</span>}
        </label>
        {tagInfo && (
          <span className={cx(styles.tag, tagInfo.className)}>
            {tagInfo.icon}
            {tagInfo.text}
          </span>
        )}
      </div>
      {trailingIcon ? (
        <span className={styles.control}>
          {children({ ...inputProps, className: cx(inputProps.className, styles.withTrailing) })}
          <span className={styles.trailing} aria-hidden>
            {trailingIcon}
          </span>
        </span>
      ) : (
        children(inputProps)
      )}
      {helper && (
        <p id={helperId} className={cx(styles.helper, flagged && styles.helperCheck)}>
          {helper}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          <WarningCircleIcon size={18} weight="bold" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}
