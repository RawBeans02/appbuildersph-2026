import { ArrowClockwiseIcon, WarningCircleIcon, type Icon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { cx } from './cx'
import styles from './StateBlock.module.css'

// Empty and error blocks: a 64 px circle icon, a 22/28 800 title, a 17/25 body
// and one action (plus an optional secondary).
export function StateBlock({
  tone = 'empty',
  icon: IconComponent,
  title,
  body,
  children,
  footnote,
}: {
  tone?: 'empty' | 'warn' | 'error'
  icon: Icon
  title: ReactNode
  body?: ReactNode
  // The action(s): buttons or links.
  children?: ReactNode
  // A line under the actions.
  footnote?: ReactNode
}) {
  return (
    <section className={cx(styles.block, tone === 'error' && styles.error, tone === 'warn' && styles.warn)} role={tone === 'error' ? 'alert' : undefined}>
      <span className={styles.icon} aria-hidden>
        <IconComponent size={32} weight="bold" />
      </span>
      <h2 className={styles.title}>{title}</h2>
      {body && <p className={styles.body}>{body}</p>}
      {children && <div className={styles.actions}>{children}</div>}
      {footnote && <p className={styles.footnote}>{footnote}</p>}
    </section>
  )
}

// The shared records error (COPY.md, Shared), with "Try again".
export function RecordsError({ onRetry, children }: { onRetry?: () => void; children?: ReactNode }) {
  return (
    <StateBlock
      tone="error"
      icon={WarningCircleIcon}
      title="Couldn't open the records"
      body="Nothing was lost. Your records are still saved on this phone."
      footnote="Still stuck? Close Agapay and open it again."
    >
      <Button
        tagalog="Subukan ulit"
        icon={<ArrowClockwiseIcon size={22} weight="bold" aria-hidden />}
        onClick={onRetry ?? (() => window.location.reload())}
      >
        Try again
      </Button>
      {children}
    </StateBlock>
  )
}
