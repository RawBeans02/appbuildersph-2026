import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import type { FieldInputProps } from '../../../components'
import { cx } from '../../../components/cx'
import styles from './SyncPage.module.css'

// A code typed into a Field, hidden by default with the show/hide toggle every
// password input gets (QUALITY.md). The toggle is named by its own text, so
// the field's label stays the input's only label. Used by the enroll code here
// and the DOH view code (src/features/doh/).
export function SecretInput({
  input,
  name,
  value,
  onChange,
}: {
  input: FieldInputProps
  name: string
  value: string
  onChange: (value: string) => void
}) {
  const [shown, setShown] = useState(false)
  return (
    <span className={styles.secret}>
      <input
        {...input}
        className={cx(input.className, styles.secretInput)}
        type={shown ? 'text' : 'password'}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" className={styles.reveal} aria-pressed={shown} onClick={() => setShown((current) => !current)}>
        {shown ? <EyeSlashIcon size={24} weight="bold" aria-hidden /> : <EyeIcon size={24} weight="bold" aria-hidden />}
        <span className="visually-hidden">Show {name}</span>
      </button>
    </span>
  )
}
