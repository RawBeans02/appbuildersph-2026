import { CaretRightIcon, CircleNotchIcon, ClockIcon, PackageIcon, ScanIcon, XCircleIcon } from '@phosphor-icons/react'
import { useCallback, useState } from 'react'
import { Link } from '../../app/Link'
import { BottomSheet, Button, Pill, RecordsError, ScreenHeader, StateBlock } from '../../components'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { placeLine, usePlace } from '../../data/db/usePlace'
import { useDbQuery } from '../../data/db/useDbQuery'
import { monthYear } from '../../lib/format'
import { localToday } from '../../rules/dates'
import { reviewExposureStock } from '../../rules/stock'
import { watchList } from '../../rules/watch'
import screen from './screen.module.css'
import { lotName, removeStockLot, stockSections, unitWord, type ListedLot } from './stock'
import styles from './StockList.module.css'

// Screens 12a (the list) and 12b (empty), with Home's loading and error
// patterns. Rows aren't tappable: no lot screen is designed.
// NEEDS DESIGN: "Remove" on a lot and its confirm sheet.

const STORES = ['stockLots', 'exposures'] as const

const readStock = async (db: AgapayDb) => {
  const [lots, exposures] = await Promise.all([db.stockLots.list({ limit: 500 }), db.exposures.list({ limit: 1000 })])
  return { lots, exposures }
}

export function StockList({ onScan, onTypeIn }: { onScan: () => void; onTypeIn: () => void }) {
  const data = useDbQuery(STORES, readStock)
  const place = usePlace()
  const [today] = useState(localToday)
  const [removing, setRemoving] = useState<ListedLot | null>(null)
  const [busy, setBusy] = useState(false)
  const closeSheet = useCallback(() => setRemoving(null), [])

  const placeText = placeLine([place.barangay && `${place.barangay} health station`], place.sample)

  async function remove(lot: ListedLot) {
    setBusy(true)
    try {
      await removeStockLot(await getDb(), lot.id)
    } catch (error) {
      console.error('The lot was not removed:', error)
    } finally {
      setBusy(false)
      setRemoving(null)
    }
  }

  if (data.status === 'loading') {
    return (
      <div className={screen.page}>
        <div className={screen.content}>
          <ScreenHeader title="Stock" place={<span className={styles.skeletonPlace} aria-hidden />} />
          <p className={styles.loading} role="status">
            <CircleNotchIcon size={18} weight="bold" aria-hidden />
            Opening the records on this phone…
          </p>
          <div className={styles.skeletonLink} aria-hidden />
          <div className={styles.skeletonHeading} aria-hidden />
          <div className={styles.rows} aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.skeletonRow}>
                <span className={styles.skeletonTitle} />
                <span className={styles.skeletonMeta} />
              </div>
            ))}
          </div>
        </div>
        <ScanButton onScan={onScan} />
      </div>
    )
  }

  if (data.status === 'error') {
    return (
      <div className={screen.page}>
        <div className={screen.content}>
          <ScreenHeader title="Stock" place={placeText} />
          <RecordsError />
        </div>
      </div>
    )
  }

  const { lots, exposures } = data.data
  if (lots.length === 0) {
    return (
      <div className={screen.page}>
        <div className={screen.content}>
          <ScreenHeader title="Stock" place={placeText} />
          <div className={styles.empty}>
            <StateBlock
              icon={PackageIcon}
              title="No medicine recorded yet"
              body="Scan a box to add its lot and expiry. It takes a few seconds and works offline."
            >
              <Button variant="text" onClick={onTypeIn}>
                Type it in instead
              </Button>
            </StateBlock>
          </div>
        </div>
        <ScanButton onScan={onScan} />
      </div>
    )
  }

  const review = reviewExposureStock(watchList(exposures, today), lots, today)
  const { expiring, rest } = stockSections(lots, today)

  return (
    <div className={screen.page}>
      <div className={screen.content}>
        <ScreenHeader title="Stock" place={placeText} />
        <Link to="/compare" className={styles.compare}>
          <span className={styles.compareText}>
            <span className={styles.compareTitle}>Exposure and stock</span>
            <span className={styles.compareMeta}>
              {review.exposed} exposed · {review.stock.capsulesOnHand} doxycycline capsules
            </span>
          </span>
          <CaretRightIcon size={22} weight="bold" aria-hidden className={styles.caret} />
        </Link>

        {expiring.length > 0 && (
          <section aria-labelledby="stock-expiring">
            <h2 id="stock-expiring" className={styles.heading}>
              Expires within 6 weeks
            </h2>
            <LotRows lots={expiring} onRemove={setRemoving} />
          </section>
        )}
        {rest.length > 0 && (
          <section aria-labelledby="stock-all">
            <h2 id="stock-all" className={styles.heading}>
              All stock
            </h2>
            <LotRows lots={rest} onRemove={setRemoving} />
          </section>
        )}
      </div>
      <ScanButton onScan={onScan} line />

      <BottomSheet
        open={removing !== null}
        onClose={closeSheet}
        title={removing ? `Remove ${lotName(removing)}, lot ${removing.lot}?` : ''}
      >
        <Button variant="destructive" disabled={busy} onClick={() => removing && void remove(removing)}>
          Remove
        </Button>
        <Button variant="text" onClick={closeSheet}>
          Cancel
        </Button>
      </BottomSheet>
    </div>
  )
}

function LotRows({ lots, onRemove }: { lots: ListedLot[]; onRemove: (lot: ListedLot) => void }) {
  return (
    <ul className={styles.rows}>
      {lots.map((lot) => (
        <li key={lot.id} className={cx(styles.row, lot.status === 'expiring' && styles.rowExpiring)}>
          <div className={styles.rowMain}>
            <p className={styles.rowTitle}>{lotName(lot)}</p>
            <p className={styles.rowMeta}>
              <span className={styles.lotCode}>{lot.lot}</span> · EXP {monthYear(lot.expiry)}
            </p>
            {lot.status === 'expiring' && (
              <span className={styles.pill}>
                <Pill tone="warn" icon={<ClockIcon size={16} weight="bold" aria-hidden />}>
                  Expires within 6 weeks
                </Pill>
              </span>
            )}
            {lot.status === 'expired' && (
              <span className={styles.pill}>
                <Pill tone="bad" icon={<XCircleIcon size={16} weight="bold" aria-hidden />}>
                  Expired: set aside
                </Pill>
              </span>
            )}
            <Button
              variant="text"
              className={styles.remove}
              aria-label={`Remove ${lotName(lot)}, lot ${lot.lot}`}
              onClick={() => onRemove(lot)}
            >
              Remove
            </Button>
          </div>
          <div className={styles.count}>
            <span className={styles.countNumber}>{lot.quantity}</span>
            <span className={styles.countUnit}>{unitWord(lot.unit, lot.quantity)}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ScanButton({ onScan, line }: { onScan: () => void; line?: boolean }) {
  return (
    <div className={cx(screen.footer, line && screen.footerLine)}>
      <Button icon={<ScanIcon size={22} weight="bold" aria-hidden />} onClick={onScan}>
        Scan a box
      </Button>
    </div>
  )
}
