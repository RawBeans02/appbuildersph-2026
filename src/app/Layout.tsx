import { useEffect, type ReactNode } from 'react'
import { BottomNav, BOTTOM_NAV_HEIGHT } from '../components/BottomNav'
import { cx } from '../components/cx'
import { PHASE2 } from '../lib/phase2'
import { useFlowActive } from './flow'
import styles from './Layout.module.css'

// The app frame. Phone screens get the bottom nav, except inside a flow
// (useFlowMode) and on the municipal laptop's screens, which bring their own
// LaptopNav.
export function Layout({ path, notice, children }: { path: string; notice?: ReactNode; children: ReactNode }) {
  const inFlow = useFlowActive()
  // Phase 2's DOH view (/doh) is a wide desktop page too, with no bottom nav.
  const laptop = path === '/municipal' || path.startsWith('/municipal/') || (PHASE2 && path === '/doh')
  const showNav = !laptop && !inFlow

  // The toast sits above the nav.
  useEffect(() => {
    document.documentElement.style.setProperty('--nav-offset', showNav ? `${BOTTOM_NAV_HEIGHT}px` : '0px')
  }, [showNav])

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {notice}
      <main id="main" tabIndex={-1} className={cx(styles.main, showNav && styles.withNav, laptop && styles.laptop)}>
        {children}
      </main>
      {showNav && <BottomNav path={path} />}
    </>
  )
}
