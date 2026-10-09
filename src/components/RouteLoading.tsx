import { CircleNotchIcon } from '@phosphor-icons/react'
import styles from './RouteLoading.module.css'

// The fallback while a screen's chunk loads (design pass 2, M4), in place of a
// bare "Loading…". The spinner turns only because the chunk is really loading.
export function RouteLoading() {
  return (
    <div className={`${styles.screen} motion-safe`} role="status">
      <CircleNotchIcon className="spin" size={24} weight="bold" aria-hidden />
      <span>Opening AgapayMo…</span>
    </div>
  )
}
