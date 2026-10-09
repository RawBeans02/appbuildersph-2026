import { cx } from './cx'
import styles from './LoopArt.module.css'

// I2, the compact loop (design pass 2): this phone → QR → RHU laptop → QR →
// this phone, drawn inline (design/svg/loop-compact.svg without its metadata).
// The labels are an HTML ordered list under the nodes, so they read and
// translate as text. With `draw`, the connectors draw once from left to right.
const NODE_AT = ['10%', '30%', '50%', '70%', '90%']

export function LoopArt({ labels, draw = false }: { labels: readonly string[]; draw?: boolean }) {
  const connector = cx('loop-connector', draw && 'draw-long')
  return (
    <figure className={styles.figure}>
      <svg
        className={styles.art}
        viewBox="0 0 335 56"
        aria-hidden
        focusable="false"
        fill="none"
        stroke="var(--ink)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect fill="var(--sunken)" x="23.5" y="10" width="20" height="34" rx="4" />
        <path d="M23.5 16h20M23.5 38h20" />
        <rect x="88.5" y="12" width="9" height="9" rx="1.5" />
        <rect x="103.5" y="12" width="9" height="9" rx="1.5" />
        <rect x="88.5" y="30" width="9" height="9" rx="1.5" />
        <path d="M103.5 30h3M112.5 30v3M103.5 35.5v3.5M108.5 39h4" />
        <rect x="153.5" y="12" width="28" height="20" rx="3" />
        <path d="M149.5 37.5h36" />
        <rect x="222.5" y="12" width="9" height="9" rx="1.5" />
        <rect x="237.5" y="12" width="9" height="9" rx="1.5" />
        <rect x="222.5" y="30" width="9" height="9" rx="1.5" />
        <path d="M237.5 30h3M246.5 30v3M237.5 35.5v3.5M242.5 39h4" />
        <rect x="291.5" y="10" width="20" height="34" rx="4" />
        <path d="M291.5 16h20M291.5 38h20" />
        <circle cx="33.5" cy="27" r="3.5" fill="var(--warn-fill)" stroke="none" />
        <path className={connector} pathLength={1} d="M49.5 27H82.5M78.5 23l4 4-4 4" />
        <path className={connector} pathLength={1} d="M118.5 27H143.5M139.5 23l4 4-4 4" style={draw ? { animationDelay: '150ms' } : undefined} />
        <path className={connector} pathLength={1} d="M191.5 27H216.5M212.5 23l4 4-4 4" style={draw ? { animationDelay: '300ms' } : undefined} />
        <path className={connector} pathLength={1} d="M252.5 27H285.5M281.5 23l4 4-4 4" style={draw ? { animationDelay: '450ms' } : undefined} />
      </svg>
      <ol className={styles.labels}>
        {labels.map((label, i) => (
          <li key={i} style={{ left: NODE_AT[i] }}>
            {label}
          </li>
        ))}
      </ol>
    </figure>
  )
}
