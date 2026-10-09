import { InfoIcon, WarningIcon } from '@phosphor-icons/react'
import { useMemo, useRef } from 'react'
import styles from './CheckedWording.module.css'
import { checkLine, checkNumbers } from './numberCheck'

// Screen 19a's wording box: an editable text with each number checked
// against the plan as the officer types. A number the plan doesn't have gets
// a dashed amber outline and a warning icon, and the check line under the box
// turns amber and names it (never color only; 19e). The marks are drawn on a
// layer over the text field that copies its text exactly, so the field stays
// a plain, accessible textarea.

export function CheckedWording({
  id,
  value,
  onChange,
  reference,
}: {
  // The id a visible label points at (19d's "Wording (optional)"). The box's
  // name stays "Plan wording" in every state, which holds the label's word.
  id?: string
  value: string
  onChange: (text: string) => void
  // The plan's own text: the rule-based template and the steps.
  reference: string
}) {
  const check = useMemo(() => checkNumbers(value, reference), [value, reference])
  const line = checkLine(check)
  const marks = useRef<HTMLDivElement>(null)

  return (
    <div className={styles.wording}>
      <div className={styles.box}>
        <textarea
          id={id}
          className={styles.field}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            if (marks.current) marks.current.scrollTop = event.currentTarget.scrollTop
          }}
          aria-label="Plan wording"
          aria-describedby={line ? 'wording-check' : undefined}
          spellCheck
        />
        <div ref={marks} className={styles.marks} aria-hidden>
          {check.segments.map((segment, i) =>
            segment.number === 'new' ? (
              <mark key={i} className={styles.new}>
                {segment.text}
                <span className={styles.badge}>
                  <WarningIcon size={12} weight="bold" />
                </span>
              </mark>
            ) : (
              <span key={i}>{segment.text}</span>
            ),
          )}
          {/* A trailing newline needs a character after it to take its line. */}
          {value.endsWith('\n') && ' '}
        </div>
      </div>
      {line && (
        <p id="wording-check" role="status" className={line.tone === 'warn' ? styles.lineWarn : styles.lineInfo}>
          {line.tone === 'warn' ? (
            <WarningIcon size={18} weight="bold" aria-hidden />
          ) : (
            <InfoIcon size={18} weight="bold" aria-hidden />
          )}
          {line.text}
        </p>
      )}
    </div>
  )
}
