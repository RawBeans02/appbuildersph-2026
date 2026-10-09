import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  QrCodeIcon,
  SealCheckIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { useFlowMode } from '../../app/flow'
import { BottomSheet, Button, ButtonLink, FlowTopBar, RecordsError, ScreenHeader, StateBlock } from '../../components'
import { cx } from '../../components/cx'
import { getDb } from '../../data/db/appDb'
import type { AgapayDb } from '../../data/db/db'
import { placeLine, usePlace } from '../../data/db/usePlace'
import { useDbQuery } from '../../data/db/useDbQuery'
import { clockTime } from '../../lib/format'
import { localToday } from '../../rules/dates'
import { collectRawCounts } from './counts'
import { createExport, createPairingQr, readPhoneRecords, type ExportResult, type PairingQr } from './exportQr'
import { resolvePlace } from './identity'
import { QrImage } from './QrImage'
import { exportReceipt } from './receipt'
import styles from './SendPage.module.css'
import { useWakeLock } from './wakeLock'
import { reusableExport, suppressCounts, weekOf, whatLeaves, type CountSection } from './whatLeaves'

// Screen 14: 14a what leaves this phone, 14b the signed QR (a flow: no nav,
// screen kept awake), 14c marked as shared (the BHW's own confirmation: the
// phone can't know the laptop read it), and the QR error.

type Exported = Extract<ExportResult, { ok: true }>
type View = 'list' | 'qr' | 'shared' | 'error'

const readSendData = async (db: AgapayDb) => {
  const [records, seed, identity] = await Promise.all([readPhoneRecords(db), db.getSeedInfo(), db.getDeviceIdentity()])
  return { records, canSend: resolvePlace(seed).ok, nextSeq: identity?.nextSeq ?? 1 }
}

const STORES = ['residents', 'exposures', 'hingaChecks', 'stockLots', 'flags', 'deviceIdentity'] as const

export default function SendPage() {
  const data = useDbQuery(STORES, readSendData)
  const place = usePlace()
  const [today] = useState(localToday)
  const week = weekOf(today)
  const [view, setView] = useState<View>('list')
  // made: this QR was made by the last tap (not the same export shown again),
  // so it plays `reveal-qr` once (14e).
  const [shown, setShown] = useState<{ qr: Exported; at: Date; made: boolean } | null>(null)
  // null: the pairing sheet is closed.
  const [pairing, setPairing] = useState<PairingQr | 'making' | null>(null)
  const working = useRef(false)

  useFlowMode(view === 'qr')
  useWakeLock(view === 'qr' || (pairing !== null && pairing !== 'making' && pairing.ok))

  // After a view change, its heading takes focus (and the page goes back to
  // the top), so a screen reader hears the new screen. Not on first load.
  const viewChanged = useRef(false)
  const focusHeading = useCallback((node: HTMLElement | null) => {
    if (!node || !viewChanged.current) return
    window.scrollTo(0, 0)
    node.focus({ preventScroll: true })
  }, [])
  const go = (next: View) => {
    viewChanged.current = true
    setView(next)
  }

  const counts = data.status === 'ready' ? suppressCounts(collectRawCounts(data.data.records, today)) : null
  // Showing the QR again with nothing changed shows the same export.
  const again = counts ? reusableExport(shown?.qr ?? null, week, counts) : null

  async function showQr() {
    if (working.current || !counts) return
    working.current = true
    try {
      const qr = again ?? (await createExport(await getDb(), today))
      if (qr.ok) {
        setShown({ qr, at: new Date(), made: !again })
        go('qr')
      } else {
        go('error')
      }
    } catch {
      go('error')
    } finally {
      working.current = false
    }
  }

  async function showPairing() {
    setPairing('making')
    try {
      setPairing(await createPairingQr(await getDb()))
    } catch (cause) {
      setPairing({ ok: false, reason: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  const header = (
    <ScreenHeader title="Send to the RHU" place={placeLine([place.barangay, `Week ${week}`], place.sample)} />
  )

  if (view === 'qr' && shown) {
    const { payload, text } = shown.qr
    const receipt = exportReceipt(shown.qr)
    return (
      <div className={styles.screen}>
        <FlowTopBar backKind="close" onBack={() => go('list')} />
        <h1 ref={focusHeading} tabIndex={-1} className={styles.qrTitle}>
          Show this to the municipal laptop
        </h1>
        <div className={cx(styles.qrBox, styles.qrBoxShown, shown.made && 'reveal-qr')}>
          <QrImage text={text} label="QR code with this week's counts" />
        </div>
        <p className={styles.code}>
          {payload.barangay} · {payload.epiWeek} · #{payload.seq}
        </p>
        <p className={styles.hold}>
          Hold the phone steady in front of the laptop's camera. Turn the brightness up if it doesn't scan.
        </p>
        <div className={styles.qrActions}>
          {/* 14d: the receipt, every value read from this export. */}
          <div className={styles.receipt}>
            <p>This QR holds {receipt.counts} counts and no names.</p>
            <p className={styles.receiptMono}>
              {receipt.bytes} bytes · signed on this phone · export #{receipt.seq}
            </p>
            <p className={styles.receiptMono}>Key {receipt.fingerprint}</p>
          </div>
          <Button tagalog="Tapos na" onClick={() => go('shared')}>
            Done, it was scanned
          </Button>
          <Button variant="text" onClick={() => go('list')}>
            What's in this QR
          </Button>
        </div>
      </div>
    )
  }

  if (view === 'shared' && shown) {
    const { payload } = shown.qr
    return (
      <div className={styles.screen}>
        {header}
        <div className={styles.shared}>
          {/* This view only opens from the "Done, it was scanned" tap, so the check stamps (14c). */}
          <span className={styles.sharedIcon} aria-hidden>
            <CheckCircleIcon className="stamp" size={34} weight="bold" />
          </span>
          {/* The screen's h1 is the header's; the design draws this one as the headline. */}
          <h2 ref={focusHeading} tabIndex={-1} className={styles.sharedTitle}>
            Marked as shared
          </h2>
          <p className={styles.sharedBody}>
            Export #{payload.seq} for week {payload.epiWeek}, shown at {clockTime(shown.at)}. Only the counts left this
            phone, and only as the QR.
          </p>
          <Button variant="text" onClick={() => go('list')}>
            See what was shared
          </Button>
        </div>
        <div className={styles.footer}>
          <ButtonLink to="/">Back to Home</ButtonLink>
        </div>
      </div>
    )
  }

  if (data.status === 'loading') {
    return (
      <div className={styles.screen}>
        {header}
        <p role="status" className={styles.loading}>
          <CircleNotchIcon className="spin" size={18} weight="bold" aria-hidden />
          Opening the records on this phone…
        </p>
        <div className={styles.skeleton} aria-hidden />
      </div>
    )
  }

  if (data.status === 'error' || !counts) {
    return (
      <div className={styles.screen}>
        {header}
        <div className={styles.state}>
          <RecordsError />
        </div>
      </div>
    )
  }

  if (view === 'error') {
    return (
      <div className={styles.screen}>
        {header}
        <div className={styles.state}>
          <StateBlock tone="error" icon={WarningCircleIcon} title="Couldn't make the QR" body="Nothing was sent. Try again.">
            <Button
              tagalog="Subukan ulit"
              icon={<ArrowClockwiseIcon size={22} weight="bold" aria-hidden />}
              onClick={() => void showQr()}
            >
              Try again
            </Button>
          </StateBlock>
        </div>
      </div>
    )
  }

  const exportNumber = again ? again.payload.seq : data.data.nextSeq
  return (
    <div className={styles.screen}>
      {header}
      <WhatLeaves sections={whatLeaves(counts)} headingRef={focusHeading} />
      <ButtonLink to="/receive" variant="secondary">Receive RHU instructions</ButtonLink>
      <p className={styles.meta}>
        <SealCheckIcon size={18} weight="bold" aria-hidden />
        <span>
          Export <span className={styles.mono}>#{exportNumber}</span> · signed on this phone
        </span>
      </p>
      {/* NEEDS DESIGN: phone pairing QR. Built from the shared components until then. */}
      {data.data.canSend && (
        <div className={styles.pair}>
          <Button variant="text" onClick={() => void showPairing()}>
            Pair with the RHU laptop
          </Button>
        </div>
      )}
      <div className={cx(styles.footer, styles.footerDivided)}>
        <Button tagalog="Ipakita" icon={<QrCodeIcon size={22} weight="bold" aria-hidden />} onClick={() => void showQr()}>
          Show the QR
        </Button>
      </div>

      <BottomSheet open={pairing !== null} onClose={() => setPairing(null)} title="Pair with the RHU laptop">
        <PairingSheetBody pairing={pairing} onRetry={() => void showPairing()} onDone={() => setPairing(null)} />
      </BottomSheet>
    </div>
  )
}

// 14a's table: the groups of age bands and the single counts, as sent.
function WhatLeaves({ sections, headingRef }: { sections: CountSection[]; headingRef: (node: HTMLElement | null) => void }) {
  const headingId = useId()
  return (
    <>
      <h2 ref={headingRef} id={headingId} tabIndex={-1} className={styles.heading}>
        What leaves this phone
      </h2>
      <p className={styles.sub}>Only these counts. No names, birthdays or addresses.</p>
      <div className={styles.card}>
        <table className={styles.table} aria-labelledby={headingId}>
          {sections.map((section) => (
            <tbody key={section.heading ?? section.rows[0].label} className={section.heading ? styles.group : styles.single}>
              {section.heading && (
                <tr>
                  <th scope="rowgroup" colSpan={2} className={styles.groupHeading}>
                    {section.heading}
                  </th>
                </tr>
              )}
              {section.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className={styles.footnote}>
        {'“<5” means 1 to 4. Small numbers are hidden so no household can be singled out.'}
      </p>
    </>
  )
}

// The one-time pairing QR: this phone's public key, and the fingerprint the
// officer checks on the laptop before pairing.
function PairingSheetBody({
  pairing,
  onRetry,
  onDone,
}: {
  pairing: PairingQr | 'making' | null
  onRetry: () => void
  onDone: () => void
}): ReactNode {
  if (pairing === null || pairing === 'making') return null
  if (!pairing.ok) {
    return (
      <StateBlock tone="error" icon={WarningCircleIcon} title="Couldn't make the QR" body="Nothing was sent. Try again.">
        <Button tagalog="Subukan ulit" icon={<ArrowClockwiseIcon size={22} weight="bold" aria-hidden />} onClick={onRetry}>
          Try again
        </Button>
      </StateBlock>
    )
  }
  return (
    <>
      <p className={styles.sheetText}>
        The laptop needs this phone's public key once, before it can trust this phone's QR codes.
      </p>
      <div className={styles.qrBox}>
        <QrImage text={pairing.text} label={`Pairing QR for ${pairing.barangay}`} />
      </div>
      <p className={styles.sheetText}>
        The laptop must show this code: <span className={styles.fingerprint}>{pairing.fingerprint}</span>. Pair only if
        it matches.
      </p>
      <Button onClick={onDone}>Done</Button>
    </>
  )
}
