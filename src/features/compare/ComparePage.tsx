import { useState } from 'react'
import { Link } from '../../app/Link'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { useDbQuery } from '../../data/db/useDbQuery'
import { localToday } from '../../rules/dates'
import { reviewExposureStock } from '../../rules/stock'
import { watchList } from '../../rules/watch'
import { flagForClinician, openFlags, resolveFlag } from './flags'

// Screen 13: exposure × stock. Facts and a flag for clinician review; never a
// dose. Plain until design/ lands. NEEDS DESIGN: screen 13.

const readCompareData = async (db: AgapayDb) => {
  const [exposures, lots, flags] = await Promise.all([
    db.exposures.list({ limit: 1000 }),
    db.stockLots.list({ limit: 500 }),
    db.flags.list({ limit: 500 }),
  ])
  return { exposures, lots, flags }
}

const STATUS_LABEL = { ok: 'usable', expiring: 'expires within 6 weeks', expired: 'expired: set aside' }

export default function ComparePage() {
  const data = useDbQuery(['exposures', 'stockLots', 'flags'], readCompareData)
  const [today] = useState(localToday)

  if (data.status === 'loading') return <p>Loading…</p>
  if (data.status === 'error') return <p role="alert">Could not read the records on this phone.</p>

  const review = reviewExposureStock(watchList(data.data.exposures, today), data.data.lots, today)
  const open = openFlags(data.data.flags)

  return (
    <>
      <h1>Exposure and stock</h1>
      <p>
        <strong>
          {review.exposed} exposed · {review.stock.capsulesOnHand} doxycycline capsules ·{' '}
          {review.stock.capsulesExpiringSoon} expire within 6 weeks
        </strong>
      </p>
      {review.reasons.length > 0 && (
        <ul>
          {review.reasons.map((reason) => (
            <li key={reason}>{reason}.</li>
          ))}
        </ul>
      )}

      {review.needsReview &&
        (open.length === 0 ? (
          <button type="button" onClick={() => void getDb().then((db) => flagForClinician(db, review))}>
            Flag for clinician review
          </button>
        ) : (
          <p>
            Flagged for clinician review on {open[0].createdAt.slice(0, 10)}.{' '}
            <button type="button" onClick={() => void getDb().then((db) => resolveFlag(db, open[0]))}>
              Mark as reviewed
            </button>
          </p>
        ))}
      <p>Agapay never suggests a dose. Doxycycline is given only after consultation with a health professional (DOH).</p>

      <h2>Doxycycline lots</h2>
      {review.stock.lots.length === 0 ? (
        <p>
          No doxycycline recorded. <Link to="/stock">Scan a box</Link>.
        </p>
      ) : (
        <ul>
          {review.stock.lots.map((lot) => (
            <li key={lot.id}>
              Lot {lot.lot}, expires {lot.expiry}: {lot.quantity} capsules, {STATUS_LABEL[lot.status]}
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link to="/watch">See who is being watched</Link>
      </p>
    </>
  )
}
