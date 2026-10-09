import { CheckIcon, CircleNotchIcon, ClockIcon, FlagIcon, InfoIcon, XCircleIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { useFlowMode } from '../../app/flow'
import { Link } from '../../app/Link'
import { navigate } from '../../app/router'
import { Button, FlowTopBar, RecordsError } from '../../components'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { placeLine, usePlace } from '../../data/db/usePlace'
import { useDbQuery } from '../../data/db/useDbQuery'
import { localToday } from '../../rules/dates'
import { reviewExposureStock, type ExposureStockReview } from '../../rules/stock'
import { watchList } from '../../rules/watch'
import styles from './Compare.module.css'
import { flagForClinician, openFlags, resolveFlag } from './flags'
import { flaggedAt, lotStatusLine, reasonSentence } from './text'

// Screen 13: exposure and stock. Facts from reviewExposureStock(), its
// reasons verbatim, and one action: flag for a clinician (13a), which then
// shows as a status with "Mark as reviewed" (13b). Never a dose, never a
// per-person number of capsules.

const STORES = ['exposures', 'stockLots', 'flags'] as const

const readCompareData = async (db: AgapayDb) => {
  const [exposures, lots, flags] = await Promise.all([
    db.exposures.list({ limit: 1000 }),
    db.stockLots.list({ limit: 500 }),
    db.flags.list({ limit: 500 }),
  ])
  return { exposures, lots, flags }
}

export default function ComparePage() {
  const data = useDbQuery(STORES, readCompareData)
  const place = usePlace()
  const [today] = useState(localToday)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  // Flagged by a tap in this visit: the block rises and its flag stamps (13b).
  // A flag already open when the screen opens shows still.
  const [justFlagged, setJustFlagged] = useState(false)
  useFlowMode(true)

  const placeText = placeLine([place.barangay], place.sample)

  // One write at a time, so a double tap never flags twice.
  async function write(action: (db: AgapayDb) => Promise<unknown>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await action(await getDb())
    } catch (error) {
      console.error('The flag was not saved:', error)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const header = (
    <>
      <FlowTopBar onBack={() => navigate('/stock')} />
      <div className={styles.header}>
        <h1 className={styles.title}>Exposure and stock</h1>
        {data.status === 'loading' ? (
          <span className={styles.skeletonPlace} aria-hidden />
        ) : (
          placeText && <p className={styles.place}>{placeText}</p>
        )}
      </div>
    </>
  )

  if (data.status === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          {header}
          <p className={styles.loading} role="status">
            <CircleNotchIcon className="spin" size={18} weight="bold" aria-hidden />
            Opening the records on this phone…
          </p>
          <div className={styles.rows} aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.skeletonRow}>
                <span className={styles.skeletonNumber} />
                <span className={styles.skeletonLabel} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (data.status === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          {header}
          <RecordsError />
        </div>
      </div>
    )
  }

  const review = reviewExposureStock(watchList(data.data.exposures, today), data.data.lots, today)
  const flag = openFlags(data.data.flags)[0] ?? null

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {header}

        {flag && (
          <div className={cx(styles.flagged, justFlagged && 'rise')} role="status">
            <FlagIcon size={24} weight="bold" aria-hidden className={cx(styles.flaggedIcon, justFlagged && 'stamp')} />
            <div>
              <p className={styles.flaggedTitle}>Flagged for clinician review</p>
              <p className={styles.flaggedMeta}>{flaggedAt(flag.createdAt)}. It goes in the next QR as a count.</p>
            </div>
          </div>
        )}

        <Metrics review={review} />

        {!flag && review.reasons.length > 0 && (
          <section aria-labelledby="compare-why">
            <h2 id="compare-why" className={styles.heading}>
              Why a clinician should look
            </h2>
            <ul className={styles.reasons}>
              {review.reasons.map((reason) => (
                <li key={reason}>{reasonSentence(reason)}</li>
              ))}
            </ul>
          </section>
        )}

        {!flag && (
          <section aria-labelledby="compare-lots">
            <h2 id="compare-lots" className={styles.heading}>
              Doxycycline lots
            </h2>
            {review.stock.lots.length === 0 ? (
              <p className={styles.noLots}>
                No doxycycline recorded. <Link to="/stock">Scan a box</Link>
              </p>
            ) : (
              <ul className={styles.rows}>
                {review.stock.lots.map((lot) => (
                  <li key={lot.id} className={styles.lot}>
                    <div>
                      <p className={styles.lotCode}>{lot.lot}</p>
                      <p className={cx(styles.lotStatus, styles[lot.status])}>
                        {lot.status === 'expiring' && <ClockIcon size={16} weight="bold" aria-hidden />}
                        {lot.status === 'expired' && <XCircleIcon size={16} weight="bold" aria-hidden />}
                        {lotStatusLine(lot.expiry, lot.status)}
                      </p>
                    </div>
                    <p className={styles.lotCount}>
                      {lot.quantity} {lot.quantity === 1 ? 'capsule' : 'capsules'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <p className={styles.doseNote}>
          <InfoIcon size={22} weight="bold" aria-hidden className={styles.doseIcon} />
          <span>AgapayMo never suggests a dose. Doxycycline is given only after consultation with a health professional (DOH guideline).</span>
        </p>
      </div>

      {flag ? (
        <div className={styles.footer}>
          <Button
            variant="secondary"
            icon={<CheckIcon size={22} weight="bold" aria-hidden />}
            disabled={busy}
            onClick={() => void write((db) => resolveFlag(db, flag))}
          >
            Mark as reviewed
          </Button>
        </div>
      ) : (
        review.needsReview && (
          <div className={cx(styles.footer, styles.footerLine)}>
            <Button
              tagalog="I-flag"
              icon={<FlagIcon size={22} weight="bold" aria-hidden />}
              disabled={busy}
              onClick={() => {
                setJustFlagged(true)
                void write((db) => flagForClinician(db, review))
              }}
            >
              Flag for clinician review
            </Button>
          </div>
        )
      )}
    </div>
  )
}

function Metrics({ review }: { review: ExposureStockReview }) {
  const expiring = review.stock.capsulesExpiringSoon
  return (
    <div className={styles.rows}>
      <p className={styles.metric}>
        <span className={styles.metricNumber}>{review.exposed}</span>
        <span className={styles.metricLabel}>people exposed to floodwater</span>
      </p>
      <p className={styles.metric}>
        <span className={styles.metricNumber}>{review.stock.capsulesOnHand}</span>
        <span className={styles.metricLabel}>doxycycline capsules on hand</span>
      </p>
      <p className={cx(styles.metric, expiring > 0 && styles.metricWarn)}>
        <span className={styles.metricNumber}>{expiring}</span>
        <span className={styles.metricLabel}>
          {expiring > 0 && <ClockIcon size={20} weight="bold" aria-hidden />}
          of them expire within 6 weeks
        </span>
      </p>
    </div>
  )
}
