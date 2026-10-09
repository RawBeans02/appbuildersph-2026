import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from '../app/Link'
import styles from './Button.module.css'
import { cx } from './cx'

// Buttons from the design (56 px, radius 12, 18/24 700, full width on phone).
// Primary is ink; a Tagalog suffix follows a middle dot in a lighter color.
// One primary per screen. Destructive only inside a confirm sheet.

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'destructive'

type Look = {
  variant?: ButtonVariant
  // Tagalog after a middle dot, e.g. "Subukan ulit".
  tagalog?: string
  // A Phosphor icon element, 22–24 px, Bold.
  icon?: ReactNode
  // One after the words (e.g. ArrowRightIcon for "Next").
  iconEnd?: ReactNode
  // Camera (dark) screens.
  onNight?: boolean
}

function Content({ icon, iconEnd, tagalog, children }: { icon?: ReactNode; iconEnd?: ReactNode; tagalog?: string; children: ReactNode }) {
  return (
    <>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span>
        {children}
        {tagalog && <span className={styles.tagalog}> · {tagalog}</span>}
      </span>
      {iconEnd && <span className={styles.icon}>{iconEnd}</span>}
    </>
  )
}

const classes = ({ variant = 'primary', onNight }: Look, className?: string) =>
  cx(styles.button, styles[variant], onNight && styles.onNight, className)

export function Button({
  variant,
  tagalog,
  icon,
  iconEnd,
  onNight,
  className,
  children,
  type = 'button',
  ...rest
}: Look & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={classes({ variant, onNight }, className)} {...rest}>
      <Content icon={icon} iconEnd={iconEnd} tagalog={tagalog}>
        {children}
      </Content>
    </button>
  )
}

export function ButtonLink({
  to,
  variant,
  tagalog,
  icon,
  iconEnd,
  onNight,
  className,
  children,
  ...rest
}: Look & AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <Link to={to} className={classes({ variant, onNight }, className)} {...rest}>
      <Content icon={icon} iconEnd={iconEnd} tagalog={tagalog}>
        {children}
      </Content>
    </Link>
  )
}
