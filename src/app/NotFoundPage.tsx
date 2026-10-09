import { HouseIcon } from '@phosphor-icons/react'
import { ButtonLink } from '../components/Button'
import { LocalStatus } from '../components/LocalStatus'
import { cx } from '../components/cx'
import { useFlowMode } from './flow'
import styles from './NotFoundPage.module.css'
import { usePath } from './router'

// The designed 404 (design: Agapay Phone 4 Send and Privacy, 404). Served
// offline by the app shell. No bottom nav: one way back. On the municipal
// laptop's paths, the same block sits centered and leads to the municipal home.
export function NotFoundPage() {
  const path = usePath()
  const laptop = path === '/municipal' || path.startsWith('/municipal/')
  useFlowMode(true)

  return (
    <div className={cx(styles.page, laptop && styles.laptop)}>
      <div className={styles.block}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>Walang ganitong page.</h1>
        <p className={styles.body}>This page isn't part of Agapay. Your records are safe on this phone.</p>
        <div className={styles.status}>
          <LocalStatus device={laptop ? 'laptop' : 'phone'} />
        </div>
      </div>
      <div className={styles.actions}>
        {laptop ? (
          <ButtonLink to="/municipal" icon={<HouseIcon size={22} weight="bold" aria-hidden />}>
            Go to the municipal home
          </ButtonLink>
        ) : (
          <ButtonLink to="/" tagalog="Pumunta sa Home" icon={<HouseIcon size={22} weight="bold" aria-hidden />}>
            Go to Home
          </ButtonLink>
        )}
      </div>
    </div>
  )
}
