import { HouseIcon, PackageIcon, QrCodeIcon, UsersThreeIcon, WindIcon, type Icon } from '@phosphor-icons/react'
import { Link } from '../app/Link'
import styles from './BottomNav.module.css'
import { cx } from './cx'

// The phone's bottom nav: Home, Watch list, Hinga (a raised ink circle),
// Stock, Send. Active: ink, Fill icon, 700, a bar at the top. Hidden inside
// the Hinga, scan and send flows (the layout decides).

const TABS: { path: string; label: string; icon: Icon }[] = [
  { path: '/', label: 'Home', icon: HouseIcon },
  { path: '/watch', label: 'Watch list', icon: UsersThreeIcon },
  { path: '/hinga', label: 'Hinga', icon: WindIcon },
  { path: '/stock', label: 'Stock', icon: PackageIcon },
  { path: '/send', label: 'Send', icon: QrCodeIcon },
]

export const BOTTOM_NAV_HEIGHT = 78

export function BottomNav({ path }: { path: string }) {
  return (
    <nav className={styles.nav} aria-label="Main">
      {TABS.map(({ path: to, label, icon: IconComponent }) => {
        const active = path === to
        if (to === '/hinga') {
          return (
            <Link key={to} to={to} className={cx(styles.tab, styles.hinga)} aria-current={active ? 'page' : undefined}>
              <span className={styles.circle} aria-hidden>
                <IconComponent size={30} weight="bold" />
              </span>
              {label}
            </Link>
          )
        }
        return (
          <Link key={to} to={to} className={cx(styles.tab, active && styles.active)} aria-current={active ? 'page' : undefined}>
            <span className={styles.bar} aria-hidden />
            <IconComponent className={styles.icon} size={26} weight={active ? 'fill' : 'bold'} aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
