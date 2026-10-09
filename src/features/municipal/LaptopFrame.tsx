import {
  ClockCounterClockwiseIcon,
  CloudArrowUpIcon,
  ListNumbersIcon,
  ScanIcon,
  ShieldCheckIcon,
  TableIcon,
  type Icon,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Link } from '../../app/Link'
import { LocalStatus } from '../../components'
import { cx } from '../../components/cx'
import { PHASE2 } from '../../lib/phase2'
import styles from './LaptopFrame.module.css'
import { useLaptopAiReady } from './laptopAi'
import { useLaptopPlace } from './place'

// The municipal laptop's frame (1280 × 800 design): the LaptopNav sidebar,
// then the screen with its title (the one h1) and the line under it.

export type LaptopSection = 'scan' | 'merged' | 'plan' | 'log' | 'sync'

const ITEMS: { section: LaptopSection; to: string; label: string; icon: Icon }[] = [
  { section: 'scan', to: '/municipal', label: 'Scan QR codes', icon: ScanIcon },
  { section: 'merged', to: '/municipal/merged', label: 'Merged view', icon: TableIcon },
  { section: 'plan', to: '/municipal/plan', label: 'Plan', icon: ListNumbersIcon },
  { section: 'log', to: '/municipal/log', label: 'Approval log', icon: ClockCounterClockwiseIcon },
  // Phase 2 only (VITE_PHASE2): the optional sync. NEEDS DESIGN (TASKS.md P2-B).
  ...(PHASE2 ? [{ section: 'sync' as const, to: '/municipal/sync', label: 'Sync', icon: CloudArrowUpIcon }] : []),
]

export function LaptopNav({ active }: { active: LaptopSection }) {
  const { place } = useLaptopPlace()
  const aiReady = useLaptopAiReady()
  return (
    <nav aria-label="Municipal" className={styles.nav}>
      <div className={styles.brand}>
        <span className={styles.tile} aria-hidden>
          a
        </span>
        <div>
          <p className={styles.name}>Agapay</p>
          <p className={styles.role}>Municipal view</p>
        </div>
      </div>
      <p className={styles.place}>{place}</p>
      <ul className={styles.items}>
        {ITEMS.map(({ section, to, label, icon: ItemIcon }) => (
          <li key={section}>
            <Link
              to={to}
              className={cx(styles.item, section === active && styles.active)}
              aria-current={section === active ? 'page' : undefined}
            >
              <ItemIcon size={22} weight="bold" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.foot}>
        <LocalStatus device="laptop" stacked ready={aiReady} />
        <Link to="/privacy" className={styles.privacy}>
          <ShieldCheckIcon size={18} weight="bold" aria-hidden />
          Privacy &amp; AI
        </Link>
      </div>
    </nav>
  )
}

export function LaptopFrame({
  active,
  title,
  sub,
  action,
  children,
}: {
  active: LaptopSection
  title: ReactNode
  sub?: ReactNode
  // The screen's primary action, on the right of the title (screen 18).
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={styles.frame}>
      <LaptopNav active={active} />
      <div className={styles.screen}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>{title}</h1>
            {sub && <p className={styles.sub}>{sub}</p>}
          </div>
          {action && <div className={styles.action}>{action}</div>}
        </header>
        {children}
      </div>
    </div>
  )
}
