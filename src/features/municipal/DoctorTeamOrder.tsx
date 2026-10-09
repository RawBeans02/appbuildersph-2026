import { FlagIcon } from '@phosphor-icons/react'
import { Fragment } from 'react'
import { Pill } from '../../components'
import { cx } from '../../components/cx'
import { PRIORITY_WEIGHTS, type MunicipalPlan, type ScoreComponentKey } from '../../rules/plan'
import styles from './DoctorTeamOrder.module.css'
import { BAR_MAX_PX, doctorOrder } from './doctorOrder'
import { firstPriority } from './merged'

// 18d: the plan's doctor-team order as stacked bars, one per received
// barangay, scaled to the largest score. Scores only: this panel never shows
// capsule counts. The bars are static; only the barangay whose report just
// landed (`filling`) plays `fill`, once.

const LEGEND: { key: ScoreComponentKey; label: string }[] = [
  { key: 'urgentReferrals', label: `URGENT referrals × ${PRIORITY_WEIGHTS.urgentReferrals}` },
  { key: 'fastBreathing', label: `Fast-breathing referrals × ${PRIORITY_WEIGHTS.fastBreathing}` },
  { key: 'inWatchWindow', label: `In the watch window × ${PRIORITY_WEIGHTS.inWatchWindow}` },
]

const share = (px: number) => `${(px / BAR_MAX_PX) * 100}%`

export function DoctorTeamOrder({ plan, filling }: { plan: MunicipalPlan; filling?: string }) {
  const rows = doctorOrder(plan.priority)
  const first = firstPriority(plan)?.entry.barangay
  return (
    <section className={styles.panel} aria-labelledby="doctor-order-heading">
      <h2 id="doctor-order-heading" className={styles.heading}>
        Doctor-team order
      </h2>
      <p className={styles.lead}>
        Made by fixed rules from the counts: URGENT referrals count 3 times, fast-breathing referrals 2 times, people in
        the watch window once.
      </p>
      <ul className={styles.legend}>
        {LEGEND.map((item) => (
          <li key={item.key}>
            <span className={cx(styles.swatch, styles[item.key])} aria-hidden />
            {item.label}
          </li>
        ))}
      </ul>
      <ol className={styles.rows}>
        {rows.map((row) => (
          <li key={row.barangay} className={styles.row}>
            <span className={styles.name}>
              {row.name}
              {row.barangay === first && (
                <Pill tone="warn" icon={<FlagIcon size={16} weight="bold" aria-hidden />}>
                  Priority
                </Pill>
              )}
            </span>
            <span className={cx(styles.bar, row.barangay === filling && 'fill')} aria-hidden>
              {row.segments.map((segment) => (
                <Fragment key={segment.key}>
                  {segment.solid > 0 && (
                    <span className={cx(styles.solid, styles[segment.key])} style={{ width: share(segment.solid) }} />
                  )}
                  {segment.dashed > 0 && (
                    <span className={cx(styles.dashed, styles[segment.key])} style={{ width: share(segment.dashed) }} />
                  )}
                </Fragment>
              ))}
            </span>
            <span className={styles.score} aria-hidden>
              {row.score}
            </span>
            <span className="visually-hidden">{row.label}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
